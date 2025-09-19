# OpenTsiolkovsky Web API

## Endpoints

- GET `/` — Health message
- GET `/healthz` — Returns `ok`
- POST `/api/simulation` — Run simulation from JSON config body
- POST `/api/simulation/path` — Run simulation loading config from server path
- POST `/api/upload` — Run simulation from multipart upload

## POST /api/simulation

- Request: `application/json` matching `RocketConfig`（C++互換のキー名。下記サンプル参照）
- Response: `200 OK` with `Vec<SimulationState>` as JSON
- Error: `400 Bad Request` `{ "error": string, "detail": string }`

Request example (minimal):

```
POST /api/simulation
Content-Type: application/json

{
  "name(str)": "sample",
  "calculate condition": {
    "end time[s]": 60,
    "time step for output[s]": 1,
    "air density variation file exist?(bool)": false,
    "air density variation file name(str)": "",
    "variation ratio of air density[%](-100to100, default=0)": 0
  },
  "launch": {
    "position LLH[deg,deg,m]": [35.0, 139.0, 0.0],
    "velocity NED[m/s]": [0.0, 0.0, 0.0],
    "time(UTC)[y,m,d,h,min,sec]": [2023,1,1,12,0,0]
  },
  "stage1": {
    "power flight mode(int)": 0,
    "free flight mode(int)": 2,
    "mass initial[kg]": 1000.0,
    "thrust": {
      "Isp vac file exist?(bool)": false,
      "Isp vac file name(str)": "",
      "Isp coefficient[-]": 1.0,
      "const Isp vac[s]": 200.0,
      "thrust vac file exist?(bool)": false,
      "thrust vac file name(str)": "",
      "thrust coefficient[-]": 1.0,
      "const thrust vac[N]": 0.0,
      "burn start time(time of each stage)[s]": 0.0,
      "burn end time(time of each stage)[s]": 0.0,
      "forced cutoff time(time of each stage)[s]": 0.0,
      "throat diameter[m]": 0.1,
      "nozzle expansion ratio[-]": 5.0,
      "nozzle exhaust pressure[Pa]": 101300.0
    },
    "aero": {
      "body diameter[m]": 0.5,
      "normal coefficient file exist?(bool)": false,
      "normal coefficient file name(str)": "",
      "normal multiplier[-]": 1.0,
      "const normal coefficient[-]": 0.2,
      "axial coefficient file exist?(bool)": false,
      "axial coefficient file name(str)": "",
      "axial multiplier[-]": 1.0,
      "const axial coefficient[-]": 0.2,
      "ballistic coefficient(ballistic flight mode)[kg/m2]": 100.0
    },
    "attitude": {
      "attitude file exist?(bool)": false,
      "attitude file name(str)": "",
      "const elevation[deg]": 83.0,
      "const azimuth[deg]": 113.0,
      "pitch offset[deg]": 0.0,
      "yaw offset[deg]": 0.0,
      "roll offset[deg]": 0.0,
      "gyro bias x[deg/h]": 0.0,
      "gyro bias y[deg/h]": 0.0,
      "gyro bias z[deg/h]": 0.0
    },
    "dumping product": {
      "dumping product exist?(bool)": false,
      "dumping product separation time[s]": 130.0,
      "dumping product mass[kg]": 10.0,
      "dumping product ballistic coefficient[kg/m2]": 100.0,
      "additional speed at dumping NED[m/s,m/s,m/s]": [0.0,0.0,0.0]
    },
    "attitude neutrality(3DoF)": {
      "considering neutrality?(bool)": false,
      "CG, Controller position file(str)": "",
      "CP file(str)": ""
    },
    "6DoF": {
      "CG,CP,Controller position file(str)": "",
      "moment of inertia file name(str)": ""
    },
    "stage": {
      "following stage exist?(bool)": false,
      "separation time[s]": 1e6
    }
  },
  "wind": {
    "wind file exist?(bool)": false,
    "wind file name(str)": "",
    "const wind[m/s,deg]": [0.0, 270.0]
  }
}
```

> **Multi-stage configuration**
>
> For multi-stage vehicles the request body can include a `stages` array (each element mirroring the `stage1` schema and adding `separation_time_s`). When present, the server emits the legacy `stage1`, `stage2`, `stage3`, … blocks expected by the C++ simulator. If `stages` is omitted the single `stage` object remains fully supported for backward compatibility.

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

## Response schema: SimulationState

Each endpoint returns an array of states. Fields per state:

- time: seconds from start (number)
- position: ECI position [m] { x, y, z }
- velocity: ECI velocity [m/s] { x, y, z }
- mass: kg (number)
- stage: current stage index (number)
- altitude: height above sea level [m] (number)
- velocity_magnitude: |v| in ECI [m/s] (number)
- mach_number: air-relative Mach [-] (number)
- dynamic_pressure: Q [Pa] (number)
- thrust: current thrust [N] (number)
- drag_force: axial drag [N] (number)

Error response:

```
HTTP/1.1 400 Bad Request
Content-Type: application/json

{ "error": "Failed to create simulator", "detail": "...message..." }
```
