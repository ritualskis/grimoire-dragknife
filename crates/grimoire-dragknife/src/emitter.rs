pub fn format_coord(v: f64, is_metric: bool) -> String {
    if is_metric {
        format!("{:.4}", v)
    } else {
        format!("{:.5}", v)
    }
}
