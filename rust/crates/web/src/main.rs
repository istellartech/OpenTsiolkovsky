use axum::{
    routing::get,
    Router,
};

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(|| async { "OpenTsiolkovsky Web API" }));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await.unwrap();
    println!("OpenTsiolkovsky Web API listening on http://0.0.0.0:3001");
    
    axum::serve(listener, app).await.unwrap();
}