#![allow(non_snake_case)]
use clap::Parser;
use openTsiolkovsky::optimization::{
    problem::{OptimizationRequest, Problem},
    solve,
};
use std::process::ExitCode;

#[derive(Parser)]
#[command(
    about = "Optimization numerical benchmarks and ZERO input readiness (not flight performance)"
)]
struct Args {
    #[arg(long, required_unless_present = "schema", conflicts_with = "schema")]
    config: Option<std::path::PathBuf>,
    #[arg(long, conflicts_with_all = ["schema", "check"])]
    output: Option<std::path::PathBuf>,
    #[arg(long, conflicts_with = "schema")]
    check: bool,
    #[arg(long)]
    schema: bool,
}

fn execute(args: Args) -> Result<u8, (u8, String)> {
    if args.schema {
        let schema = schemars::schema_for!(OptimizationRequest);
        println!(
            "{}",
            serde_json::to_string_pretty(&schema).map_err(|e| (1, e.to_string()))?
        );
        return Ok(0);
    }
    let path = args.config.ok_or((2, "--config is required".into()))?;
    let bytes = std::fs::read(path).map_err(|e| (1, e.to_string()))?;
    let input: OptimizationRequest =
        serde_json::from_slice(&bytes).map_err(|e| (3, e.to_string()))?;
    input.validate().map_err(|e| (3, e))?;
    let issues = match &input.problem {
        Problem::Zero(m) => m.readiness_issues(),
        _ => vec![],
    };
    if args.check {
        println!(
            "{}",
            serde_json::json!({"ready":issues.is_empty(),"issues":issues})
        );
        return Ok(if issues.is_empty() { 0 } else { 3 });
    }
    if !issues.is_empty() {
        return Err((3, issues.join("\n")));
    }
    let result = solve(input).map_err(|e| (1, e))?;
    let json = serde_json::to_string_pretty(&result).map_err(|e| (1, e.to_string()))?;
    if let Some(path) = args.output {
        std::fs::write(path, json).map_err(|e| (1, e.to_string()))?;
    } else {
        println!("{json}");
    }
    Ok(
        if result.converged
            && result
                .validation
                .as_ref()
                .is_some_and(|v| v.status == "passed")
        {
            0
        } else {
            1
        },
    )
}

fn main() -> ExitCode {
    match execute(Args::parse()) {
        Ok(code) => ExitCode::from(code),
        Err((code, message)) => {
            eprintln!("{message}");
            ExitCode::from(code)
        }
    }
}
