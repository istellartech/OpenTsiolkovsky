//! JSON text with short numeric arrays kept on one line
//!
//! `serde_json::to_string_pretty` puts every number of a table on its own
//! line; here a row such as `[0.0, 15000.0]` stays on one line, so tables
//! read as tables.

use serde_json::Value;

/// Pretty JSON (2-space indent) with arrays of scalars on one line
pub fn to_pretty_json(value: &Value) -> String {
    let mut out = String::new();
    write_value(value, 0, &mut out);
    out
}

fn is_scalar(v: &Value) -> bool {
    !matches!(v, Value::Array(_) | Value::Object(_))
}

fn write_value(value: &Value, indent: usize, out: &mut String) {
    let pad = |n: usize| "  ".repeat(n);
    match value {
        Value::Array(items) if items.is_empty() => out.push_str("[]"),
        Value::Array(items) if items.iter().all(is_scalar) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                out.push_str(&item.to_string());
            }
            out.push(']');
        }
        Value::Array(items) => {
            out.push_str("[\n");
            for (i, item) in items.iter().enumerate() {
                out.push_str(&pad(indent + 1));
                write_value(item, indent + 1, out);
                out.push_str(if i + 1 < items.len() { ",\n" } else { "\n" });
            }
            out.push_str(&pad(indent));
            out.push(']');
        }
        Value::Object(map) if map.is_empty() => out.push_str("{}"),
        Value::Object(map) => {
            out.push_str("{\n");
            for (i, (key, item)) in map.iter().enumerate() {
                out.push_str(&pad(indent + 1));
                out.push_str(&Value::String(key.clone()).to_string());
                out.push_str(": ");
                write_value(item, indent + 1, out);
                out.push_str(if i + 1 < map.len() { ",\n" } else { "\n" });
            }
            out.push_str(&pad(indent));
            out.push('}');
        }
        scalar => out.push_str(&scalar.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rows_stay_on_one_line() {
        let v = json!({ "a": [[0.0, 1.5], [2, 3]], "b": { "c": "x" }, "d": [] });
        assert_eq!(
            to_pretty_json(&v),
            "{\n  \"a\": [\n    [0.0, 1.5],\n    [2, 3]\n  ],\n  \"b\": {\n    \"c\": \"x\"\n  },\n  \"d\": []\n}"
        );
        let parsed: Value = serde_json::from_str(&to_pretty_json(&v)).unwrap();
        assert_eq!(parsed, v);
    }
}
