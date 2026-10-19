//! Immutable, externally controlled free-flight physics, shared with Simulator.
//! Launcher reactions and optional moment trim remain in the simulator adapter.
use super::{
    Scalar, atmosphere::AtmosphericConditions, coordinates::CoordinateTransform as C,
    gravity::GravityModel, norm,
};
use crate::{
    math::constants::G0,
    sim::FlightMode,
    vehicle::{NormalForce, StageModel, Vehicle},
};
use nalgebra::{Matrix3, Vector3};

pub struct Environment<T: Scalar> {
    pub llh: Vector3<T>,
    pub atmosphere: AtmosphericConditions<T>,
    pub eci_to_ned: Matrix3<T>,
    pub velocity_ned: Vector3<T>,
    pub air_ned: Vector3<T>,
    pub air_speed: T,
    pub mach: T,
    pub q: T,
}

pub fn environment<T: Scalar>(vehicle: &Vehicle, t: T, y: &[T; 7]) -> Environment<T> {
    let r = Vector3::new(y[1], y[2], y[3]);
    let v = Vector3::new(y[4], y[5], y[6]);
    let llh = C::pos_ecef_to_llh_scalar(&C::pos_eci_to_ecef_scalar(&r, t));
    let atmosphere = vehicle.atmosphere.at_scalar(llh.z);
    let eci_to_ned = C::dcm_eci_to_ned_scalar(&llh, t);
    let velocity_ned = C::vel_eci_to_ecef_ned_frame_scalar(&r, &v, &eci_to_ned);
    let air_ned = velocity_ned - vehicle.wind.ned_scalar(llh.z);
    let air_speed = norm(&air_ned);
    let mach = if atmosphere.speed_of_sound.re() > 0.0 {
        air_speed / atmosphere.speed_of_sound
    } else {
        T::from(0.0)
    };
    let q = atmosphere.density * 0.5 * air_speed * air_speed;
    Environment {
        llh,
        atmosphere,
        eci_to_ned,
        velocity_ned,
        air_ned,
        air_speed,
        mach,
        q,
    }
}

pub fn propulsion<T: Scalar>(
    stage: &StageModel,
    powered: bool,
    local_time: T,
    pressure: T,
) -> (T, T) {
    if powered && let Some(engine) = &stage.engine {
        let tv = engine.thrust.eval_scalar(local_time);
        let isp = engine.isp.eval_scalar(local_time);
        if tv.re() > 0.0 && isp.re() > 0.0 {
            let thrust = tv - pressure * engine.exit_area;
            return (
                if thrust.re() > 0.0 {
                    thrust
                } else {
                    T::from(0.0)
                },
                tv / (isp * G0),
            );
        }
    }
    (T::from(0.0), T::from(0.0))
}

pub fn aerodynamics<T: Scalar>(
    stage: &StageModel,
    mode: FlightMode,
    mach: T,
    air_body: &Vector3<T>,
    q: T,
    mass: T,
) -> Vector3<T> {
    let speed = norm(air_body);
    if speed.re() < 0.1 {
        return Vector3::zeros();
    }
    let q_area = q * stage.aero.area;
    let ca = match (&stage.aero.ca_power_off, mode == FlightMode::Powered) {
        (Some(off), false) => off.eval_scalar(mach),
        _ => stage.aero.ca.eval_scalar(mach),
    };
    match mode {
        FlightMode::Ballistic => {
            return Vector3::new(
                -q / stage.aero.ballistic_coefficient.max(1e-9)
                    * if mass.re() > 0.0 { mass } else { T::from(0.0) },
                T::from(0.0),
                T::from(0.0),
            );
        }
        FlightMode::AeroStable => return Vector3::new(-ca * q_area, T::from(0.0), T::from(0.0)),
        _ => {}
    }
    let (u, v, w) = (air_body.x, air_body.y, air_body.z);
    let blend = speed * 0.02;
    let axial_sign =
        u / (u * u + blend * blend).sqrt() * (speed * speed + blend * blend).sqrt() / speed;
    let axial = -axial_sign * ca * q_area;
    let cross = norm(&Vector3::new(T::from(0.0), v, w));
    if cross.re() == 0.0 {
        // CN_alpha * atan(cross/|u|) * cross_vector/cross has a
        // finite, nonzero derivative at axial flow. Avoid 0/0 and do not
        // discard this lateral damping derivative.
        if let NormalForce::Slope(slope) = &stage.aero.normal {
            let k = slope.eval_scalar(mach) * q_area / u.abs();
            return Vector3::new(axial, -k * v, -k * w);
        }
        return Vector3::new(axial, T::from(0.0), T::from(0.0));
    }
    let angle = cross.atan2(u.abs());
    let cn = match &stage.aero.normal {
        NormalForce::Slope(slope) => slope.eval_scalar(mach) * angle,
        NormalForce::Table(grid) => grid.eval_scalar(mach, angle * (180.0 / std::f64::consts::PI)),
    };
    let normal = cn * q_area;
    Vector3::new(axial, -normal * v / cross, -normal * w / cross)
}

/// Fixed discrete mode; stage table epoch and evaluation time are independent.
#[derive(Clone, Copy)]
pub struct PhaseContext {
    pub stage: usize,
    pub powered: bool,
}

pub struct Evaluation<T: Scalar> {
    pub derivative: [T; 7],
    pub environment: Environment<T>,
    pub air_body: Vector3<T>,
    pub thrust: T,
    pub mass_flow: T,
    pub specific_force: T,
}

/// Commanded NED attitude, radians. No mutable event state or I/O is consulted.
/// Unsupported moment trim is rejected by the optimization input validator.
pub fn evaluate<T: Scalar>(
    vehicle: &Vehicle,
    phase: PhaseContext,
    t: T,
    stage_start: T,
    y: &[T; 7],
    attitude: [T; 3],
) -> Result<Evaluation<T>, &'static str> {
    if !t.re().is_finite()
        || !stage_start.re().is_finite()
        || !y.iter().chain(attitude.iter()).all(|v| v.re().is_finite())
        || y[0].re() <= 0.0
        || phase.stage >= vehicle.stages.len()
    {
        return Err("non-finite flight input or non-positive mass");
    }
    let e = environment(vehicle, t, y);
    let stage = &vehicle.stages[phase.stage];
    if stage.trim.is_some() {
        return Err("external control with moment trim is unsupported");
    }
    let body = C::dcm_ned_to_body_scalar(attitude[0], attitude[1], Some(attitude[2]));
    let air_body = body * e.air_ned;
    let mode = if phase.powered {
        FlightMode::Powered
    } else {
        FlightMode::free(stage.free_flight)
    };
    let air_body = if mode.follows_attitude_program() {
        air_body
    } else {
        Vector3::new(e.air_speed, T::from(0.0), T::from(0.0))
    };
    let aero = aerodynamics(stage, mode, e.mach, &air_body, e.q, y[0]);
    let (thrust, mass_flow) =
        propulsion(stage, phase.powered, t - stage_start, e.atmosphere.pressure);
    let force = aero + Vector3::new(thrust, T::from(0.0), T::from(0.0));
    let force_eci = if !mode.follows_attitude_program() && e.air_speed.re() >= 0.1 {
        e.eci_to_ned.transpose() * e.air_ned * (aero.x / e.air_speed)
    } else {
        (body * e.eci_to_ned).transpose() * force
    };
    let acc =
        force_eci / y[0] + GravityModel::new().gravity_scalar(&Vector3::new(y[1], y[2], y[3]));
    let derivative = [-mass_flow, y[4], y[5], y[6], acc.x, acc.y, acc.z];
    if !derivative.iter().all(|v| v.re().is_finite())
        || !e.q.re().is_finite()
        || !e.llh.z.re().is_finite()
    {
        return Err("non-finite flight evaluation");
    }
    Ok(Evaluation {
        derivative,
        environment: e,
        air_body,
        thrust,
        mass_flow,
        specific_force: norm(&force) / y[0],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        config::{Config, NoFiles},
        simulate,
    };
    use nalgebra::SVector;
    use num_dual::jacobian;

    fn momo() -> Vehicle {
        let config = Config::from_json(include_str!("../../examples/momo.json")).unwrap();
        Vehicle::load(&config, &NoFiles).unwrap().0
    }

    #[test]
    fn external_control_matches_simulator_during_momo_ascent() {
        let mut vehicle = momo();
        vehicle.end_time = 240.0;
        let flight = simulate(&vehicle);
        for s in flight.trajectory.iter().skip(1) {
            let y = [
                s.mass_kg,
                s.pos_eci_x_m,
                s.pos_eci_y_m,
                s.pos_eci_z_m,
                s.vel_eci_x_mps,
                s.vel_eci_y_mps,
                s.vel_eci_z_mps,
            ];
            let e = evaluate(
                &vehicle,
                PhaseContext {
                    stage: 0,
                    powered: s.flight_mode == FlightMode::Powered,
                },
                s.time_s,
                0.0,
                &y,
                [
                    s.azimuth_deg.to_radians(),
                    s.elevation_deg.to_radians(),
                    s.roll_deg.to_radians(),
                ],
            )
            .unwrap();
            assert!((e.thrust - s.thrust_n).abs() < 1e-8);
            assert!((e.environment.q - s.dynamic_pressure_pa).abs() < 1e-8);
            for (a, b) in e.derivative[4..].iter().zip([
                s.accel_eci_x_mps2,
                s.accel_eci_y_mps2,
                s.accel_eci_z_mps2,
            ]) {
                assert!((a - b).abs() < 1e-10, "{} {a} {b}", s.time_s);
            }
        }
    }

    #[test]
    fn local_ad_matches_directional_differences_in_physical_units() {
        let mut vehicle = momo();
        // Nonconstant engine tables test absolute time and stage epoch separately.
        use crate::math::interp::Linear;
        let engine = vehicle.stages[0].engine.as_mut().unwrap();
        engine.thrust = Linear::from_points([(0.0, 15000.0), (116.0, 16000.0)]);
        engine.isp = Linear::from_points([(0.0, 200.0), (116.0, 220.0)]);
        vehicle.wind.rows = vec![[0.0, 5.0, 350.0], [40000.0, 20.0, 10.0]];
        let r = C::pos_llh_to_ecef(&Vector3::new(42.51, 143.5, 7500.0));
        let v = C::vel_eci_init(
            &Vector3::new(-50.0, 180.0, -400.0),
            &Vector3::new(42.51, 143.5, 7500.0),
        );
        let x = SVector::<f64, 10>::from_row_slice(&[
            34.0, 2.0, 900.0, r.x, r.y, r.z, v.x, v.y, v.z, 1.4,
        ]);
        let outputs = |z: SVector<_, 10>| {
            let y = [z[2], z[3], z[4], z[5], z[6], z[7], z[8]];
            let e = evaluate(
                &vehicle,
                PhaseContext {
                    stage: 0,
                    powered: true,
                },
                z[0],
                z[1],
                &y,
                [
                    num_dual::DualSVec64::<10>::from_re(1.9),
                    z[9],
                    num_dual::DualSVec64::<10>::from_re(0.0),
                ],
            )
            .unwrap();
            SVector::<_, 11>::from_iterator(e.derivative.into_iter().chain([
                e.environment.q,
                e.environment.llh.z,
                e.mass_flow,
                e.specific_force,
            ]))
        };
        let (_, j) = jacobian(outputs, &x);
        let direction = SVector::<f64, 10>::from_row_slice(&[
            0.7, -0.3, 30.0, 200.0, -70.0, 100.0, -8.0, 15.0, 10.0, 0.03,
        ]);
        let predicted = j * direction;
        let f = |z: SVector<f64, 10>| {
            let e = evaluate(
                &vehicle,
                PhaseContext {
                    stage: 0,
                    powered: true,
                },
                z[0],
                z[1],
                &[z[2], z[3], z[4], z[5], z[6], z[7], z[8]],
                [1.9, z[9], 0.0],
            )
            .unwrap();
            SVector::<_, 11>::from_iterator(e.derivative.into_iter().chain([
                e.environment.q,
                e.environment.llh.z,
                e.mass_flow,
                e.specific_force,
            ]))
        };
        for h in [1e-3, 1e-4, 1e-5] {
            let fd = (f(x + direction * h) - f(x - direction * h)) / (2.0 * h);
            for k in 0..11 {
                assert!(
                    (fd[k] - predicted[k]).abs() < 2e-4 * predicted[k].abs().max(1e-3),
                    "h={h} row={k}: {} vs {}",
                    fd[k],
                    predicted[k]
                );
            }
        }
        assert!(j[(0, 0)].abs() > 1e-5);
        assert!((j[(0, 0)] + j[(0, 1)]).abs() < 1e-12);
    }

    #[test]
    fn axial_airflow_retains_normal_force_derivative() {
        let vehicle = momo();
        let (_, j) = jacobian(
            |v| {
                aerodynamics(
                    &vehicle.stages[0],
                    FlightMode::Powered,
                    num_dual::DualSVec64::<3>::from_re(1.0),
                    &v,
                    num_dual::DualSVec64::<3>::from_re(1000.0),
                    num_dual::DualSVec64::<3>::from_re(900.0),
                )
            },
            &Vector3::new(100.0, 0.0, 0.0),
        );
        let expected = -0.2 * 1000.0 * vehicle.stages[0].aero.area / 100.0;
        assert!((j[(1, 1)] - expected).abs() < 1e-12);
        assert!((j[(2, 2)] - expected).abs() < 1e-12);
        assert!(j.iter().all(|v| v.is_finite()));
    }
}
