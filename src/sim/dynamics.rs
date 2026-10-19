//! Forces on the vehicle and the equations of motion

use super::sample::{FlightMode, Sample};
use super::{Simulator, StateVector};
use crate::math::constants::{G0, OMEGA_EARTH};
use crate::physics::atmosphere::AtmosphericConditions;
use crate::physics::coordinates::CoordinateTransform;
use crate::physics::flight;
use nalgebra::{Matrix3, Vector3};

/// Everything the dynamics evaluates at one instant; shared by the
/// equations of motion and the output so both always agree
#[derive(Debug, Clone)]
pub(super) struct Forces {
    pub stage_idx: usize,
    pub is_powered: bool,
    pub flight_mode: FlightMode,
    pub pos_llh: Vector3<f64>,
    pub dcm_eci_to_ned: Matrix3<f64>,
    pub dcm_ned_to_body: Matrix3<f64>,
    /// Attitude: azimuth, elevation, roll [deg]
    pub attitude_deg: Vector3<f64>,
    /// Earth-relative velocity in NED [m/s]
    pub vel_ned: Vector3<f64>,
    pub wind_speed: f64,
    pub wind_dir_deg: f64,
    pub atm: AtmosphericConditions,
    pub mach: f64,
    pub q: f64,
    /// alpha, beta, total angle of attack [rad]
    pub aoa: Vector3<f64>,
    /// Effective thrust (after the nozzle exit pressure loss) [N]
    pub thrust: f64,
    pub mass_flow: f64,
    pub thrust_body: Vector3<f64>,
    /// Thrust trim angles (pitch, yaw) [rad]
    pub gimbal_rad: (f64, f64),
    pub aero_body: Vector3<f64>,
    pub gravity_eci: Vector3<f64>,
    pub acc_eci: Vector3<f64>,
    /// On the launcher: acceleration along the rail without the
    /// constraint (Earth-fixed frame) [m/s²]; 0 off the launcher
    pub launcher_along: f64,
}

impl Simulator {
    /// Equations of motion: `[dm/dt, dr/dt, dv/dt]`
    pub(super) fn dynamics(&self, t: f64, y: &StateVector) -> StateVector {
        let f = self.forces(t, y);
        [
            -f.mass_flow,
            y[4],
            y[5],
            y[6],
            f.acc_eci.x,
            f.acc_eci.y,
            f.acc_eci.z,
        ]
    }

    /// Gravity, thrust and aerodynamics at time `t` and state `y`
    pub(super) fn forces(&self, t: f64, y: &StateVector) -> Forces {
        let mass = y[0];
        let position = Vector3::new(y[1], y[2], y[3]);
        let velocity = Vector3::new(y[4], y[5], y[6]);

        let discrete_t = self.phase_time.unwrap_or(t);
        let stage_idx = self.stage_index_for_time(discrete_t);
        let stage = &self.vehicle.stages[stage_idx];
        let is_powered = self.is_powered_at(stage_idx, discrete_t);
        let flight_mode = if is_powered {
            FlightMode::Powered
        } else {
            FlightMode::free(stage.free_flight)
        };

        let env = flight::environment(&self.vehicle, t, y);
        let pos_llh = env.llh;
        let atm = env.atmosphere;
        let dcm_eci_to_ned = env.eci_to_ned;
        let vel_ned = env.velocity_ned;
        let (wind_speed, wind_dir_deg) = self.vehicle.wind.at(pos_llh.z);
        let vel_air_ned = env.air_ned;
        let air_speed = env.air_speed;
        let mach = env.mach;
        let q = env.q;

        // Attitude: the program, or along the airflow for a free body
        let (dcm_ned_to_body, attitude_deg) = if flight_mode.follows_attitude_program()
            || air_speed < 1.0e-6
        {
            self.vehicle.attitude.dcm(t)
        } else {
            let horizontal = vel_air_ned.x.hypot(vel_air_ned.y);
            let att = Vector3::new(
                vel_air_ned.y.atan2(vel_air_ned.x).to_degrees(),
                (-vel_air_ned.z).atan2(horizontal).to_degrees(),
                0.0,
            );
            let dcm =
                CoordinateTransform::dcm_ned_to_body(att.x.to_radians(), att.y.to_radians(), None);
            (dcm, att)
        };
        let vel_air_body = dcm_ned_to_body * vel_air_ned;
        let aoa = CoordinateTransform::angle_of_attack(&vel_air_body);

        let (thrust, mass_flow) = flight::propulsion(
            stage,
            is_powered,
            self.stage_local_time(stage_idx, t),
            atm.pressure,
        );
        let aero_body = flight::aerodynamics(stage, flight_mode, mach, &vel_air_body, q, mass);

        let (thrust_body, gimbal_rad) = if is_powered {
            self.trimmed_thrust(stage_idx, t, thrust, mach, &aoa, &aero_body)
        } else {
            (Vector3::new(thrust, 0.0, 0.0), (0.0, 0.0))
        };

        let gravity_eci = self.gravity.gravity_eci(&position);
        let dcm_body_to_eci = (dcm_ned_to_body * dcm_eci_to_ned).transpose();
        let mut acc_eci = if mass > 0.0 {
            dcm_body_to_eci * (thrust_body + aero_body) / mass + gravity_eci
        } else {
            gravity_eci
        };

        // On the launcher only the motion along the Earth-fixed rail is free.
        // In the rotating frame: a_rel = a - w x (w x r) - 2 w x v_rel, of
        // which the rail keeps the component along it.
        let mut launcher_along = 0.0;
        if self.launcher.active {
            let omega = Vector3::new(0.0, 0.0, OMEGA_EARTH);
            let u = CoordinateTransform::dcm_eci_to_ecef(t).transpose() * self.launcher.dir_ecef;
            let v_rel = velocity - omega.cross(&position);
            let frame = omega.cross(&omega.cross(&position)) + 2.0 * omega.cross(&v_rel);
            launcher_along = u.dot(&(acc_eci - frame));
            let along = if self.launcher.lifted {
                launcher_along
            } else {
                // Held until the thrust overcomes the weight
                launcher_along.max(0.0)
            };
            acc_eci = frame + along * u;
        }

        Forces {
            stage_idx,
            is_powered,
            flight_mode,
            pos_llh,
            dcm_eci_to_ned,
            dcm_ned_to_body,
            attitude_deg,
            vel_ned,
            wind_speed,
            wind_dir_deg,
            atm,
            mach,
            q,
            aoa,
            thrust,
            mass_flow,
            thrust_body,
            gimbal_rad,
            aero_body,
            gravity_eci,
            acc_eci,
            launcher_along,
        }
    }

    /// Forces at the current state
    pub(super) fn current_forces(&self) -> Forces {
        self.forces(self.state.time, &self.state_vector())
    }

    /// Output sample of the current state
    pub(super) fn sample(&self) -> Sample {
        let f = self.current_forces();
        let s = &self.state;
        let mass = s.mass;
        let stage = &self.vehicle.stages[f.stage_idx];
        let dcm_eci_to_body = f.dcm_ned_to_body * f.dcm_eci_to_ned;
        // Sensed acceleration excludes gravity (what an accelerometer measures)
        let acc_body = dcm_eci_to_body * (f.acc_eci - f.gravity_eci);

        let vel_ned = f.vel_ned;
        let path_angle = (-vel_ned.z).atan2(vel_ned.x.hypot(vel_ned.y));
        let gravity_ned = f.dcm_eci_to_ned * f.gravity_eci;
        let exit_area = stage.engine.as_ref().map_or(0.0, |e| e.exit_area);
        let per_mass = |v: f64| if mass > 0.0 { v / mass } else { 0.0 };
        let iip = Self::iip_of(&s.position, &s.velocity, s.time);

        Sample {
            time_s: s.time,
            stage: (f.stage_idx + 1) as u8,
            flight_mode: f.flight_mode,
            latitude_deg: f.pos_llh.x,
            longitude_deg: f.pos_llh.y,
            altitude_m: f.pos_llh.z,
            downrange_m: CoordinateTransform::distance_surface(
                &self.vehicle.launch.llh,
                &f.pos_llh,
            ),
            mass_kg: mass,
            thrust_n: f.thrust,
            isp_s: if f.mass_flow > 1.0e-4 {
                f.thrust / f.mass_flow / G0
            } else {
                0.0
            },
            vel_north_mps: vel_ned.x,
            vel_east_mps: vel_ned.y,
            vel_down_mps: vel_ned.z,
            speed_earth_mps: vel_ned.magnitude(),
            speed_inertial_mps: s.velocity.magnitude(),
            mach: f.mach,
            dynamic_pressure_pa: f.q,
            azimuth_deg: f.attitude_deg.x,
            elevation_deg: f.attitude_deg.y,
            roll_deg: f.attitude_deg.z,
            alpha_deg: f.aoa.x.to_degrees(),
            beta_deg: f.aoa.y.to_degrees(),
            aoa_total_deg: f.aoa.z.to_degrees(),
            accel_body_x_mps2: acc_body.x,
            accel_body_y_mps2: acc_body.y,
            accel_body_z_mps2: acc_body.z,
            aero_body_x_n: f.aero_body.x,
            aero_body_y_n: f.aero_body.y,
            aero_body_z_n: f.aero_body.z,
            thrust_body_x_n: f.thrust_body.x,
            thrust_body_y_n: f.thrust_body.y,
            thrust_body_z_n: f.thrust_body.z,
            gimbal_pitch_deg: f.gimbal_rad.0.to_degrees(),
            gimbal_yaw_deg: f.gimbal_rad.1.to_degrees(),
            wind_speed_mps: f.wind_speed,
            wind_direction_deg: f.wind_dir_deg,
            iip_latitude_deg: iip.map(|p| p.x),
            iip_longitude_deg: iip.map(|p| p.y),
            pos_eci_x_m: s.position.x,
            pos_eci_y_m: s.position.y,
            pos_eci_z_m: s.position.z,
            vel_eci_x_mps: s.velocity.x,
            vel_eci_y_mps: s.velocity.y,
            vel_eci_z_mps: s.velocity.z,
            accel_eci_x_mps2: f.acc_eci.x,
            accel_eci_y_mps2: f.acc_eci.y,
            accel_eci_z_mps2: f.acc_eci.z,
            loss_gravity_mps2: gravity_ned.z * path_angle.sin(),
            loss_aero_mps2: per_mass(f.aero_body.x.abs()),
            loss_thrust_mps2: if f.is_powered {
                per_mass(f.atm.pressure * exit_area)
            } else {
                0.0
            },
        }
    }

    /// Instantaneous impact point [deg] of an ECI state at time `t`
    pub(super) fn iip_of(
        pos_eci: &Vector3<f64>,
        vel_eci: &Vector3<f64>,
        t: f64,
    ) -> Option<Vector3<f64>> {
        let omega_vec = Vector3::new(0.0, 0.0, OMEGA_EARTH);
        let dcm = CoordinateTransform::dcm_eci_to_ecef(t);
        let pos_ecef = dcm * pos_eci;
        let vel_ecef = dcm * (vel_eci - omega_vec.cross(pos_eci));
        CoordinateTransform::pos_llh_iip(&pos_ecef, &vel_ecef)
    }

    /// Thrust vector in body axes and its trim angles (pitch, yaw) [rad].
    ///
    /// With a thrust trim the thrust is gimballed so that its moment about
    /// the CG balances the aerodynamic moment (C++ `power_flight_3dof`);
    /// otherwise, or when no trim exists, it lies along the body axis.
    pub(super) fn trimmed_thrust(
        &self,
        stage_idx: usize,
        t: f64,
        thrust: f64,
        mach: f64,
        aoa: &Vector3<f64>,
        aero_body: &Vector3<f64>,
    ) -> (Vector3<f64>, (f64, f64)) {
        let along = (Vector3::new(thrust, 0.0, 0.0), (0.0, 0.0));
        let Some(trim) = &self.vehicle.stages[stage_idx].trim else {
            return along;
        };
        if thrust <= 0.0 {
            return along;
        }
        let local = self.stage_local_time(stage_idx, t);
        // STA positions: +X body = -STA
        let (cg_o, cp_o, t_o) = (trim.cg_offset, trim.cp_offset, trim.gimbal_offset);
        let pos_cg = trim.cg.eval(local) - cg_o.x;
        let pos_ctrl = trim.gimbal.eval(local) - t_o.x;
        let cp = |angle: f64| trim.cp.eval(mach, angle.to_degrees().abs()) - cp_o.x;
        let (dxt, dyt, dzt) = (pos_ctrl - pos_cg, cg_o.y - t_o.y, cg_o.z - t_o.z);
        let (dxp_pitch, dxp_yaw) = (pos_cg - cp(aoa.x), pos_cg - cp(aoa.y));
        let (dyp, dzp) = (cp_o.y - cg_o.y, cp_o.z - cg_o.z);
        let f = aero_body;
        let term_yaw = (-f.y * dxp_yaw + f.x * dyp) / thrust / dxt.hypot(dyt);
        let term_pitch = (-f.z * dxp_pitch + f.x * dzp) / thrust / dxt.hypot(dzt);
        if !(term_yaw.abs() < 1.0 && term_pitch.abs() < 1.0) {
            return along;
        }
        let yaw0 = term_yaw.asin() - dyt.atan2(dxt);
        let pitch = term_pitch.asin() - dzt.atan2(dxt);
        let half_pi = std::f64::consts::FRAC_PI_2;
        if !(yaw0.abs() < half_pi && pitch.abs() < half_pi) {
            return along;
        }
        // Compound angle
        let yaw = (yaw0.tan() * pitch.cos()).atan();
        (
            thrust
                * Vector3::new(
                    yaw.cos() * pitch.cos(),
                    -yaw.sin(),
                    -yaw.cos() * pitch.sin(),
                ),
            (pitch, yaw),
        )
    }

    /// Aerodynamic force in the body frame from CA and CN.
    ///
    /// `vel_air_body` is the air-relative velocity in body axes and
    /// `q_area` is dynamic pressure x reference area. The axial force opposes
    /// the axial flow; the normal force CN(Mach, crossflow angle) lies in the
    /// plane of the body axis and the airflow and opposes the crossflow,
    /// with the crossflow angle measured from the body axis line (0-90°).
    /// For pure pitch or yaw this is the usual CN(α) / CN(β); with both, the
    /// total angle is used once instead of adding CN(α) and CN(β), which
    /// overstates a non-linear CN. When the flow comes from behind (e.g.
    /// re-entry with a fixed commanded attitude) the body is treated as
    /// symmetric, so the force still opposes the air-relative velocity and
    /// never adds energy.
    #[cfg(test)]
    pub(super) fn aero_force_body(
        &self,
        stage_idx: usize,
        mach: f64,
        powered: bool,
        vel_air_body: &Vector3<f64>,
        q_area: f64,
    ) -> Vector3<f64> {
        let stage = &self.vehicle.stages[stage_idx];
        flight::aerodynamics(
            stage,
            if powered {
                FlightMode::Powered
            } else {
                FlightMode::AttitudeProgram
            },
            mach,
            vel_air_body,
            q_area / stage.aero.area,
            1.0,
        )
    }
}
