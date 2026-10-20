//! Earth and flight physics: atmosphere, coordinates, gravity, orbits

pub mod atmosphere;
pub mod coordinates;
pub mod gravity;
pub mod orbit;

pub mod flight;

/// Scalar used by the shared physics: ordinary values or local forward AD.
pub trait Scalar: num_dual::DualNum<Primitive = f64> + Copy {}
impl<T: num_dual::DualNum<Primitive = f64> + Copy> Scalar for T {}

/// A norm with a defined zero branch (the Euclidean norm is not differentiable
/// at zero). Forces already have explicit low-speed branches.
pub(crate) fn norm<T: Scalar>(v: &nalgebra::Vector3<T>) -> T {
    let squared = v.dot(v);
    if squared.re() == 0.0 {
        T::from(0.0)
    } else {
        squared.sqrt()
    }
}
