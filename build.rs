use std::process::Command;

fn git(args: &[&str]) -> Option<String> {
    let result = Command::new("git").args(args).output().ok()?;
    result
        .status
        .success()
        .then(|| String::from_utf8_lossy(&result.stdout).trim().to_owned())
}

fn main() {
    println!("cargo:rerun-if-env-changed=OPENTSIOLKOVSKY_REVISION");
    for path in ["src", "Cargo.toml", "Cargo.lock", ".git/HEAD", ".git/index"] {
        println!("cargo:rerun-if-changed={path}");
    }
    let revision = std::env::var("OPENTSIOLKOVSKY_REVISION")
        .ok()
        .or_else(|| {
            let mut revision = git(&["rev-parse", "--short=12", "HEAD"])?;
            let dirty = git(&[
                "status",
                "--porcelain",
                "--untracked-files=normal",
                "--",
                "src",
                "build.rs",
                "Cargo.toml",
                "Cargo.lock",
            ]);
            if dirty.is_none_or(|s| !s.is_empty()) {
                revision.push_str("-dirty");
            }
            Some(revision)
        })
        .unwrap_or_else(|| "unrecorded".into());
    println!("cargo:rustc-env=OPENTSIOLKOVSKY_REVISION={revision}");
}
