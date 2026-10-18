//! Display metadata must never change flight numbers, events, IDs or Monte Carlo draws.
use openTsiolkovsky::config::{Config, NoFiles, validate};
use openTsiolkovsky::{Vehicle, simulate};
use serde_json::{Value, json};

fn without_presentation(value: &mut Value) {
    match value {
        Value::Object(map) => {
            map.remove("presentation");
            map.remove("display_name");
            for v in map.values_mut() {
                without_presentation(v);
            }
        }
        Value::Array(items) => items.iter_mut().for_each(without_presentation),
        _ => {}
    }
}

#[test]
fn booster_metadata_preserves_complete_solver_output() {
    for text in [
        include_str!("../examples/h2a202.json"),
        include_str!("../examples/h3-22s.json"),
        include_str!("../examples/ariane5.json"),
        include_str!("../examples/long-march-3b.json"),
        include_str!("../examples/soyuz-2.1a.json"),
    ] {
        let config = Config::from_json(text).unwrap();
        let roundtrip = Config::from_json(&serde_json::to_string(&config).unwrap()).unwrap();
        assert_eq!(config, roundtrip);
        let mut old = serde_json::from_str(text).unwrap();
        without_presentation(&mut old);
        let old: Config = serde_json::from_value(old).unwrap();
        let fly = |config: &Config| {
            let (vehicle, _) = Vehicle::load(config, &NoFiles).unwrap();
            let flight = simulate(&vehicle);
            json!({"trajectory": flight.trajectory, "events": flight.events,
                "bodies": flight.bodies, "forced_steps": flight.forced_steps})
        };
        assert_eq!(fly(&config), fly(&old), "{}", config.name);
    }
}

#[test]
fn metadata_is_optional_and_strictly_typed() {
    let mut value: Value = serde_json::from_str(include_str!("../examples/momo.json")).unwrap();
    without_presentation(&mut value);
    let old: Config = serde_json::from_value(value.clone()).unwrap();
    assert!(old.presentation.is_none());
    assert!(old.stages[0].presentation.is_none());
    assert!(validate(&old).is_valid());
    // Public terminology is independent of the interval count.
    value["presentation"] = json!({"stage_count": 3, "booster_count": 4});
    value["stages"][0]["presentation"] =
        json!({"name": "Custom core", "separation_name": {"ja": "補助ロケット", "en": "Boosters"}});
    let named: Config = serde_json::from_value(value.clone()).unwrap();
    assert!(validate(&named).is_valid());
    value["presentation"]["stage_count"] = json!(0);
    let invalid: Config = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(
        validate(&invalid).errors[0].path,
        "presentation.stage_count"
    );
    value["presentation"]["stage_count"] = json!(2.5);
    assert!(serde_json::from_value::<Config>(value.clone()).is_err());
    value["presentation"] = json!({"stage_count": 2, "typo": true});
    assert!(serde_json::from_value::<Config>(value.clone()).is_err());
    value["presentation"] = json!({});
    value["stages"][0]["presentation"]["name"] = json!({"ja": "名前", "en": "Name", "typo": "x"});
    assert!(serde_json::from_value::<Config>(value).is_err());
}

#[test]
fn explicit_null_optional_metadata_means_unspecified() {
    let mut value: Value = serde_json::from_str(include_str!("../examples/h3-22s.json")).unwrap();
    value["presentation"] = json!({"stage_count": null, "booster_count": null});
    value["stages"][0]["presentation"] = json!({"name": null, "separation_name": null});
    value["stages"][1]["presentation"] = Value::Null;
    value["stages"][1]["jettisons"][0]["display_name"] = Value::Null;
    let config: Config = serde_json::from_value(value.clone()).unwrap();
    assert!(validate(&config).is_valid());
    assert!(config.presentation.unwrap().stage_count.is_none());
    assert!(
        config.stages[0]
            .presentation
            .as_ref()
            .unwrap()
            .name
            .is_none()
    );
    assert!(config.stages[1].presentation.is_none());
    assert!(config.stages[1].jettisons[0].display_name.is_none());
    value["presentation"] = Value::Null;
    let config: Config = serde_json::from_value(value.clone()).unwrap();
    assert!(config.presentation.is_none());
    value["stages"][0]["presentation"]["engine_continues"] = Value::Null;
    assert!(serde_json::from_value::<Config>(value).is_err());
}
