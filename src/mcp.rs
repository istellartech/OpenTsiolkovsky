//! Model Context Protocol server (stdio)
//!
//! `openTsiolkovsky-cli mcp` reads newline-delimited JSON-RPC 2.0 messages
//! from stdin and answers on stdout, so MCP clients (Claude Code, Claude
//! Desktop, ...) can validate, fly and share vehicles. The tools wrap
//! `agent.rs`; logs go to stderr only.

use crate::agent::{
    self, AgentError, ConfigInput, ErrorKind, MAX_MONTE_CARLO_CASES, MonteCarloOptions, RunOptions,
};
use crate::montecarlo::Dispersion;
use serde_json::{Map, Value, json};
use std::io::{BufRead, Write};
use std::path::PathBuf;

/// Protocol revisions this server speaks, newest first
const PROTOCOL_VERSIONS: [&str; 4] = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS: &str = "\
OpenTsiolkovsky is a rocket flight simulator (3DoF, multi-stage, launch to impact).
Workflow: get_config_schema (or get_example_config) -> write a parameter file \
-> validate_config -> run_simulation -> create_share_link to show the result to the user.
Configurations are given as `config_path` (a param_*.json file; its CSV tables are resolved \
next to it) or as an inline `config` object (CSV names resolved against `base_dir`). \
The CLI parameter format uses literal key names that include units, e.g. \
\"burn end time(time of each stage)[s]\". Stage times are relative to the stage start; \
\"mass initial[kg]\" is the mass of that stage alone, without the upper stages. \
The web app format (ClientConfig, snake_case keys with tables inline) is accepted too. \
Results are SI units; latitude/longitude in degrees. run_monte_carlo gives impact \
dispersion ellipses for the vehicle, spent stages and jettisoned products.";

/// Serve until stdin closes
pub fn serve_stdio() -> std::io::Result<()> {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    serve(stdin.lock(), stdout.lock())
}

/// Serve one connection: a line per message in, a line per response out
pub fn serve(reader: impl BufRead, mut writer: impl Write) -> std::io::Result<()> {
    let server = Server;
    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        if let Some(response) = server.handle_line(&line) {
            writeln!(writer, "{response}")?;
            writer.flush()?;
        }
    }
    Ok(())
}

pub struct Server;

impl Server {
    /// Response to one line of input, if it needs one
    pub fn handle_line(&self, line: &str) -> Option<Value> {
        match serde_json::from_str::<Value>(line) {
            Ok(Value::Array(batch)) => {
                let responses: Vec<Value> =
                    batch.into_iter().filter_map(|m| self.handle(m)).collect();
                (!responses.is_empty()).then_some(Value::Array(responses))
            }
            Ok(message) => self.handle(message),
            Err(e) => Some(error_response(
                Value::Null,
                -32700,
                &format!("Parse error: {e}"),
            )),
        }
    }

    fn handle(&self, message: Value) -> Option<Value> {
        let Some(method) = message.get("method").and_then(Value::as_str) else {
            // A response to a request we never send, or garbage without an id
            return message.get("id").and_then(|id| {
                (message.get("result").is_none() && message.get("error").is_none())
                    .then(|| error_response(id.clone(), -32600, "Invalid request"))
            });
        };
        // Notifications (`notifications/initialized`, `notifications/cancelled`, ...)
        let id = message.get("id")?.clone();
        let params = message.get("params").cloned().unwrap_or(json!({}));
        let result = match method {
            "initialize" => Ok(self.initialize(&params)),
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({ "tools": tool_definitions() })),
            "tools/call" => self.call_tool(&params),
            _ => Err((-32601, format!("Method not found: {method}"))),
        };
        Some(match result {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err((code, msg)) => error_response(id, code, &msg),
        })
    }

    fn initialize(&self, params: &Value) -> Value {
        let requested = params.get("protocolVersion").and_then(Value::as_str);
        let version = requested
            .filter(|v| PROTOCOL_VERSIONS.contains(v))
            .unwrap_or(PROTOCOL_VERSIONS[0]);
        json!({
            "protocolVersion": version,
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": {
                "name": "opentsiolkovsky",
                "title": "OpenTsiolkovsky",
                "version": env!("CARGO_PKG_VERSION"),
            },
            "instructions": INSTRUCTIONS,
        })
    }

    fn call_tool(&self, params: &Value) -> Result<Value, (i64, String)> {
        let name = params
            .get("name")
            .and_then(Value::as_str)
            .ok_or((-32602, "Missing tool name".to_string()))?;
        let empty = Map::new();
        let args = params
            .get("arguments")
            .and_then(Value::as_object)
            .unwrap_or(&empty);
        let outcome = match name {
            "get_config_schema" => get_config_schema(args),
            "get_example_config" => Ok(example_config()),
            "validate_config" => config_input(args).map(|input| agent::validate(&input)),
            "run_simulation" => run_simulation(args),
            "run_monte_carlo" => run_monte_carlo(args),
            "create_share_link" => create_share_link(args),
            _ => return Err((-32602, format!("Unknown tool: {name}"))),
        };
        let (value, is_error) = match outcome {
            Ok(value) => {
                // A configuration that fails validation is a failed check
                let invalid = value.get("valid") == Some(&Value::Bool(false));
                (value, invalid)
            }
            Err(e) => (e.to_json(), true),
        };
        let text = serde_json::to_string_pretty(&value).unwrap_or_default();
        Ok(json!({
            "content": [{ "type": "text", "text": text }],
            "structuredContent": value,
            "isError": is_error,
        }))
    }
}

fn error_response(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

type Args = Map<String, Value>;

fn invalid(message: impl Into<String>) -> AgentError {
    AgentError::new(ErrorKind::InvalidArgument, message)
}

fn opt_str<'a>(args: &'a Args, key: &str) -> Result<Option<&'a str>, AgentError> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) if s.trim().is_empty() => Ok(None),
        Some(Value::String(s)) => Ok(Some(s)),
        Some(_) => Err(invalid(format!("`{key}` must be a string"))),
    }
}

fn opt_u64(args: &Args, key: &str) -> Result<Option<u64>, AgentError> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => v
            .as_u64()
            .map(Some)
            .ok_or_else(|| invalid(format!("`{key}` must be a non-negative integer"))),
    }
}

/// The configuration named by `config_path` or given inline as `config`
fn config_input(args: &Args) -> Result<ConfigInput, AgentError> {
    let base_dir = opt_str(args, "base_dir")?.map(PathBuf::from);
    match (opt_str(args, "config_path")?, args.get("config")) {
        (Some(_), Some(c)) if !c.is_null() => {
            Err(invalid("Give either `config_path` or `config`, not both"))
        }
        (Some(path), _) => {
            let mut input = ConfigInput::from_path(path)?;
            if let Some(dir) = base_dir {
                input.base_dir = dir;
            }
            Ok(input)
        }
        (None, Some(Value::String(text))) => Ok(ConfigInput::from_json(text.clone(), base_dir)),
        (None, Some(value @ Value::Object(_))) => {
            Ok(ConfigInput::from_json(value.to_string(), base_dir))
        }
        _ => Err(invalid(
            "Missing configuration: give `config_path` (a param_*.json file) or `config` (an object)",
        )),
    }
}

fn get_config_schema(args: &Args) -> Result<Value, AgentError> {
    match opt_str(args, "format")?.unwrap_or("param") {
        "param" => Ok(agent::param_schema()),
        "dispersion" => Ok(agent::dispersion_schema()),
        other => Err(invalid(format!(
            "Unknown format `{other}` (expected `param` or `dispersion`)"
        ))),
    }
}

fn example_config() -> Value {
    let full: Value =
        serde_json::from_str(include_str!("../examples/param_sample_01.json")).unwrap_or_default();
    json!({
        "minimal": {
            "name(str)": "simple_test",
            "calculate condition": { "end time[s]": 300, "time step for output[s]": 1 },
            "launch": { "position LLH[deg,deg,m]": [35.0, 139.0, 0.0] },
            "stage1": {
                "mass initial[kg]": 1000,
                "thrust": {
                    "const thrust vac[N]": 30000,
                    "burn end time(time of each stage)[s]": 20
                }
            }
        },
        "minimal_notes": "Omitted keys take their defaults: vertical attitude (elevation 90 deg), \
            Isp 200 s, no wind, no aerodynamics. See get_config_schema for every key.",
        "full": full,
        "full_notes": "examples/param_sample_01.json: single stage with constant thrust, \
            aerodynamics, attitude and wind. Multi-stage examples with CSV tables are in \
            examples/SS-520-4/ of the repository.",
        "default_dispersion": Dispersion::default(),
    })
}

fn run_simulation(args: &Args) -> Result<Value, AgentError> {
    let input = config_input(args)?;
    let points = opt_u64(args, "trajectory_points")?.unwrap_or(50);
    if points > 5000 {
        return Err(invalid("`trajectory_points` must be at most 5000"));
    }
    agent::run(
        &input,
        &RunOptions {
            output_prefix: opt_str(args, "output_prefix")?.map(str::to_string),
            trajectory_points: points as usize,
        },
    )
}

fn run_monte_carlo(args: &Args) -> Result<Value, AgentError> {
    let input = config_input(args)?;
    let dispersion = match (args.get("dispersion"), opt_str(args, "dispersion_path")?) {
        (Some(v), Some(_)) if !v.is_null() => {
            return Err(invalid(
                "Give either `dispersion` or `dispersion_path`, not both",
            ));
        }
        (Some(v @ Value::Object(_)), None) => agent::parse_dispersion(&v.to_string())?,
        (_, Some(path)) => {
            let text = std::fs::read_to_string(path)
                .map_err(|e| AgentError::new(ErrorKind::Io, format!("{path}: {e}")))?;
            agent::parse_dispersion(&text)?
        }
        _ => Dispersion::default(),
    };
    let cases = opt_u64(args, "cases")?.unwrap_or(100);
    agent::monte_carlo(
        &input,
        &MonteCarloOptions {
            cases: u32::try_from(cases).unwrap_or(u32::MAX),
            seed: opt_u64(args, "seed")?.unwrap_or(1),
            dispersion,
            output_prefix: opt_str(args, "output_prefix")?.map(str::to_string),
        },
    )
}

fn create_share_link(args: &Args) -> Result<Value, AgentError> {
    let input = config_input(args)?;
    agent::share_link(&input, opt_str(args, "base_url")?)
}

/// Input properties naming the configuration, shared by most tools
fn config_properties() -> Map<String, Value> {
    let props = json!({
        "config_path": {
            "type": "string",
            "description": "Path to a parameter file (param_*.json); its relative CSV file names are resolved next to it"
        },
        "config": {
            "type": "object",
            "description": "Inline configuration: a CLI parameter file object (see get_config_schema) or a web app ClientConfig"
        },
        "base_dir": {
            "type": "string",
            "description": "Directory for relative CSV file names (default: next to config_path, or the server's working directory for an inline config)"
        }
    });
    props.as_object().cloned().unwrap_or_default()
}

fn tool(
    name: &str,
    title: &str,
    description: &str,
    properties: Map<String, Value>,
    read_only: bool,
) -> Value {
    json!({
        "name": name,
        "title": title,
        "description": description,
        "inputSchema": { "type": "object", "properties": properties },
        "annotations": {
            "title": title,
            "readOnlyHint": read_only,
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": false,
        }
    })
}

fn tool_definitions() -> Vec<Value> {
    let with = |extra: Value| {
        let mut props = config_properties();
        if let Some(extra) = extra.as_object() {
            props.extend(extra.clone());
        }
        props
    };
    let output_prefix = json!({
        "type": "string",
        "description": "Also write the CLI output files with this path prefix (e.g. \"out/run1\" gives out/run1_trajectory.csv, out/run1_summary.json, ...). Omit to write nothing."
    });
    vec![
        tool(
            "get_config_schema",
            "Configuration schema",
            "JSON Schema of the CLI parameter file (format \"param\", default) or of the Monte Carlo dispersion (format \"dispersion\"), with units and defaults.",
            json!({
                "format": { "type": "string", "enum": ["param", "dispersion"], "default": "param" }
            })
            .as_object()
            .cloned()
            .unwrap_or_default(),
            true,
        ),
        tool(
            "get_example_config",
            "Example configuration",
            "A minimal and a complete example parameter file, and the default Monte Carlo dispersion. Start here to write a new vehicle.",
            Map::new(),
            true,
        ),
        tool(
            "validate_config",
            "Validate configuration",
            "Check a configuration without flying it: parse errors, invalid values, warnings about unusual settings, and referenced CSV files that are missing.",
            config_properties(),
            true,
        ),
        tool(
            "run_simulation",
            "Run simulation",
            "Fly the vehicle from launch to impact (spent stages and jettisoned products too). Returns the summary (apogee, max Q, burnout orbit, impact points, flight events) and sampled trajectory points.",
            with(json!({
                "trajectory_points": {
                    "type": "integer", "minimum": 0, "maximum": 5000, "default": 50,
                    "description": "Number of evenly spaced trajectory samples to return (0: none)"
                },
                "output_prefix": output_prefix,
            })),
            false,
        ),
        tool(
            "run_monte_carlo",
            "Run Monte Carlo dispersion",
            "Fly dispersed cases (thrust, Isp, mass, drag, attitude, wind, air density) and return the mean impact point and 1-sigma / 95 % / 99 % error ellipses of every body.",
            with(json!({
                "cases": {
                    "type": "integer", "minimum": 1, "maximum": MAX_MONTE_CARLO_CASES, "default": 100,
                    "description": "Number of cases"
                },
                "seed": { "type": "integer", "minimum": 0, "default": 1, "description": "Random seed" },
                "dispersion": {
                    "type": "object",
                    "description": "1-sigma dispersions (see get_config_schema with format \"dispersion\"); keys left out keep their defaults"
                },
                "dispersion_path": { "type": "string", "description": "Dispersion JSON file (instead of `dispersion`)" },
                "output_prefix": output_prefix,
            })),
            false,
        ),
        tool(
            "create_share_link",
            "Create web app link",
            "URL that opens the configuration in the OpenTsiolkovsky web app (3D globe, charts, Monte Carlo) for the user to inspect. CSV tables are embedded in the link; nothing is uploaded.",
            with(json!({
                "base_url": {
                    "type": "string",
                    "description": "Web app URL (default: the public site, or $OPENTSIOLKOVSKY_WEB_URL)"
                }
            })),
            true,
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn example(name: &str) -> String {
        format!("{}/examples/{name}", env!("CARGO_MANIFEST_DIR"))
    }

    fn call(server: &Server, id: i64, method: &str, params: Value) -> Value {
        let line = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        server.handle_line(&line.to_string()).expect("response")
    }

    #[test]
    fn handshake_and_tool_list() {
        let server = Server;
        let init = call(
            &server,
            1,
            "initialize",
            json!({ "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "t", "version": "0" } }),
        );
        assert_eq!(init["result"]["protocolVersion"], "2025-06-18");
        assert!(init["result"]["capabilities"]["tools"].is_object());

        let unknown_version = call(
            &server,
            2,
            "initialize",
            json!({ "protocolVersion": "1999-01-01" }),
        );
        assert_eq!(
            unknown_version["result"]["protocolVersion"],
            PROTOCOL_VERSIONS[0]
        );

        // Notifications get no response
        let note = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
        assert!(server.handle_line(&note.to_string()).is_none());

        let list = call(&server, 3, "tools/list", json!({}));
        let names: Vec<&str> = list["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            names,
            [
                "get_config_schema",
                "get_example_config",
                "validate_config",
                "run_simulation",
                "run_monte_carlo",
                "create_share_link"
            ]
        );
        assert_eq!(call(&server, 4, "ping", json!({}))["result"], json!({}));
        assert_eq!(call(&server, 5, "nope", json!({}))["error"]["code"], -32601);
    }

    #[test]
    fn malformed_input_is_a_parse_error() {
        let server = Server;
        let response = server.handle_line("{not json").unwrap();
        assert_eq!(response["error"]["code"], -32700);
        assert_eq!(response["id"], Value::Null);
    }

    #[test]
    fn tools_run_and_report_errors() {
        let server = Server;
        let run = call(
            &server,
            1,
            "tools/call",
            json!({ "name": "run_simulation", "arguments": {
                "config_path": example("param_sample_01.json"), "trajectory_points": 5 } }),
        );
        let result = &run["result"];
        assert_eq!(result["isError"], false, "{result}");
        assert!(
            result["structuredContent"]["summary"]["max_altitude_m"]
                .as_f64()
                .unwrap()
                > 0.0
        );
        assert!(
            result["content"][0]["text"]
                .as_str()
                .unwrap()
                .contains("max_altitude_m")
        );

        let missing = call(
            &server,
            2,
            "tools/call",
            json!({ "name": "run_simulation", "arguments": {} }),
        );
        assert_eq!(missing["result"]["isError"], true);
        assert_eq!(
            missing["result"]["structuredContent"]["error"]["kind"],
            "invalid_argument"
        );

        let invalid = call(
            &server,
            3,
            "tools/call",
            json!({ "name": "validate_config", "arguments": { "config": { "name(str)": "x" } } }),
        );
        assert_eq!(invalid["result"]["isError"], true);
        assert_eq!(invalid["result"]["structuredContent"]["valid"], false);

        let unknown = call(&server, 4, "tools/call", json!({ "name": "fly_to_mars" }));
        assert_eq!(unknown["error"]["code"], -32602);
    }

    #[test]
    fn schema_and_example_tools() {
        let server = Server;
        let schema = call(
            &server,
            1,
            "tools/call",
            json!({ "name": "get_config_schema", "arguments": { "format": "dispersion" } }),
        );
        assert!(schema["result"]["structuredContent"]["properties"]["isp_percent"].is_object());
        let example = call(
            &server,
            2,
            "tools/call",
            json!({ "name": "get_example_config" }),
        );
        let minimal = example["result"]["structuredContent"]["minimal"].clone();
        let check = call(
            &server,
            3,
            "tools/call",
            json!({ "name": "validate_config", "arguments": { "config": minimal } }),
        );
        assert_eq!(
            check["result"]["structuredContent"]["valid"], true,
            "{check}"
        );
    }

    #[test]
    fn serve_answers_line_by_line() {
        let input = [
            json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-03-26" } }),
            json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
            json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }),
        ]
        .map(|m| m.to_string())
        .join("\n");
        let mut out = Vec::new();
        serve(input.as_bytes(), &mut out).unwrap();
        let lines: Vec<Value> = String::from_utf8(out)
            .unwrap()
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0]["id"], 1);
        assert_eq!(lines[1]["id"], 2);
    }
}
