# OpenTsiolkovsky Web API

## Endpoints

- GET `/` — Health message
- GET `/healthz` — Returns `ok`
- POST `/api/simulation` — Run simulation from JSON config body
- POST `/api/simulation/path` — Run simulation loading config from server path
- POST `/api/upload` — Run simulation from multipart upload

## POST /api/simulation

- Request: `application/json` matching `RocketConfig`
- Response: `200 OK` with `Vec<SimulationState>` as JSON
- Error: `400 Bad Request` `{ "error": string, "detail": string }`

Example (snip):

```
POST /api/simulation
Content-Type: application/json

{ "name(str)": "sample", "calculate condition": { "end time[s]": 100, "time step for output[s]": 1, ... }, ... }
```

## POST /api/simulation/path

- Request: `application/json` `{ "config_path": "bin/param_sample_01.json" }`
- Response: `200 OK` with `Vec<SimulationState>`

## POST /api/upload

- Request: `multipart/form-data`
  - `config` (required): JSON text of `RocketConfig`
  - Optional CSV parts (headers allowed): `thrust`, `isp`, `cn`, `ca`, `attitude`, `wind`
    - `cn` supports 2D表 (Mach×|angle|) 仕様 or 1D timeseries fallback
- Response: `200 OK` with `Vec<SimulationState>`
- Error: `400 Bad Request` with JSON error body

Example using curl:

```
curl -F config=@bin/param_sample_01.json \
     -F thrust=@bin/sample/thrust.csv \
     -F isp=@bin/sample/Isp.csv \
     -F cn=@bin/sample/CN.csv \
     -F ca=@bin/sample/CA.csv \
     -F attitude=@bin/sample/attitude.csv \
     http://localhost:3001/api/upload
```

