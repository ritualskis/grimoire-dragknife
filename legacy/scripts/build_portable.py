#!/usr/bin/env python3
"""
Dragged /// Ritual Skis • Portable HTML & Package Builder
Bundles all HTML, CSS, JS assets, test suites, and samples into a standalone single-file distribution.
"""

import os
import re
import sys
import zipfile

def log(msg):
    print(f"[*] {msg}", flush=True)

def main():
    log("Starting portable distribution build for Dragged /// Ritual Skis...")
    
    # 1. Resolve paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    src_dir = os.path.join(project_root, 'src')
    dist_dir = os.path.join(project_root, 'dist')
    
    log(f"Project root: {project_root}")
    os.makedirs(dist_dir, exist_ok=True)

    # 2. Clean up legacy or intermediate artifacts
    legacy_files = [
        'DragKnife_Studio_Portable.html',
        'Launch_DragKnife_Studio_Mac.command',
        'Launch_DragKnife_Studio_Windows.bat',
        'Dragged_RitualSkis_Package.zip.tmp'
    ]
    for lf in legacy_files:
        lp = os.path.join(dist_dir, lf)
        if os.path.exists(lp):
            try:
                os.remove(lp)
            except OSError:
                pass

    # 3. Read source assets with explicit UTF-8 encoding
    log("[1/5] Reading source assets (HTML, CSS, JavaScript)...")
    
    def read_src(rel_path):
        fpath = os.path.join(src_dir, rel_path)
        with open(fpath, 'r', encoding='utf-8') as f:
            return f.read()

    html = read_src('index.html')
    css = read_src(os.path.join('css', 'styles.css'))
    ufs_js = read_src(os.path.join('js', 'unit-format-service.js'))
    parser_js = read_src(os.path.join('js', 'gcode-parser.js'))
    proc_js = read_src(os.path.join('js', 'drag-knife-processor.js'))
    vis_js = read_src(os.path.join('js', 'canvas-visualizer.js'))
    app_js = read_src(os.path.join('js', 'app.js'))

    # 4. Inline CSS via fast exact string replacement
    log("[2/5] Inlining CSS stylesheet...")
    style_tag = f"<style>\n{css}\n</style>"
    css_link_tag = '<link rel="stylesheet" href="css/styles.css">'
    if css_link_tag in html:
        html_single = html.replace(css_link_tag, style_tag)
    else:
        html_single = re.sub(
            r'<link\s+rel=["\']stylesheet["\']\s+href=["\']css/styles\.css["\']\s*/?>',
            lambda _: style_tag,
            html
        )

    # 5. Inline JavaScript bundle via safe slice replacement (avoiding regex escape overhead)
    log("[3/5] Inlining JavaScript modules into bundle...")
    script_bundle = f"""<script>
/* ==========================================================================
   DRAGGED /// RITUAL SKIS • INLINED MODULE BUNDLE
   ========================================================================== */

/* --- 1. UnitFormatService --- */
{ufs_js}

/* --- 2. GCodeParser --- */
{parser_js}

/* --- 3. DragKnifeProcessor --- */
{proc_js}

/* --- 4. CanvasVisualizer --- */
{vis_js}

/* --- 5. Application UI & Event Engine --- */
{app_js}
</script>"""

    start_script_tag = '<script src="js/unit-format-service.js"></script>'
    end_script_tag = '<script src="js/app.js"></script>'

    if start_script_tag in html_single and end_script_tag in html_single:
        s_idx = html_single.index(start_script_tag)
        e_idx = html_single.index(end_script_tag) + len(end_script_tag)
        html_single = html_single[:s_idx] + script_bundle + html_single[e_idx:]
    else:
        html_single = re.sub(
            r'<script\s+src=["\']js/unit-format-service\.js["\']></script>[\s\S]*?<script\s+src=["\']js/app\.js["\']></script>',
            lambda _: script_bundle,
            html_single
        )

    # 6. Write standalone portable HTML file
    log("[4/5] Writing standalone portable HTML and platform launchers...")
    portable_html_path = os.path.join(dist_dir, 'Dragged_RitualSkis_Portable.html')
    with open(portable_html_path, 'w', encoding='utf-8') as f:
        f.write(html_single)
    log(f"  -> Generated: {portable_html_path} ({len(html_single):,} bytes)")

    # Launchers for macOS, Linux, and Windows
    mac_cmd_path = os.path.join(dist_dir, 'Launch_Dragged_RitualSkis_Mac.command')
    with open(mac_cmd_path, 'w', encoding='utf-8') as f:
        f.write('''#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if command -v open >/dev/null 2>&1 && [[ "$OSTYPE" == "darwin"* ]]; then
    open "$DIR/Dragged_RitualSkis_Portable.html"
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$DIR/Dragged_RitualSkis_Portable.html"
else
    echo "Open $DIR/Dragged_RitualSkis_Portable.html in your web browser."
fi
''')
    os.chmod(mac_cmd_path, 0o755)

    linux_sh_path = os.path.join(dist_dir, 'Launch_Dragged_RitualSkis_Linux.sh')
    with open(linux_sh_path, 'w', encoding='utf-8') as f:
        f.write('''#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$DIR/Dragged_RitualSkis_Portable.html"
elif command -v gnome-open >/dev/null 2>&1; then
    gnome-open "$DIR/Dragged_RitualSkis_Portable.html"
else
    echo "Open $DIR/Dragged_RitualSkis_Portable.html in your web browser."
fi
''')
    os.chmod(linux_sh_path, 0o755)

    win_bat_path = os.path.join(dist_dir, 'Launch_Dragged_RitualSkis_Windows.bat')
    with open(win_bat_path, 'w', encoding='utf-8') as f:
        f.write('''@echo off
start "" "%~dp0Dragged_RitualSkis_Portable.html"
''')

    # 7. Package ZIP distribution safely using atomic temp file
    log("[5/5] Packaging ZIP distribution bundle...")
    zip_path = os.path.join(dist_dir, 'Dragged_RitualSkis_Package.zip')
    temp_zip_path = zip_path + '.tmp'

    with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(portable_html_path, 'Dragged_RitualSkis_Portable.html')
        z.write(mac_cmd_path, 'Launch_Dragged_RitualSkis_Mac.command')
        z.write(linux_sh_path, 'Launch_Dragged_RitualSkis_Linux.sh')
        z.write(win_bat_path, 'Launch_Dragged_RitualSkis_Windows.bat')

        postprocessor_py = os.path.join(project_root, 'postprocessor', 'drag_knife_postprocessor.py')
        if os.path.exists(postprocessor_py):
            z.write(postprocessor_py, 'drag_knife_postprocessor.py')

        test_edge = os.path.join(project_root, 'tests', 'test_drag_knife_edge_cases.py')
        if os.path.exists(test_edge):
            z.write(test_edge, 'test_drag_knife_edge_cases.py')

        test_comp = os.path.join(project_root, 'tests', 'test_drag_knife_comprehensive.py')
        if os.path.exists(test_comp):
            z.write(test_comp, 'test_drag_knife_comprehensive.py')

        readme_md = os.path.join(project_root, 'README.md')
        if os.path.exists(readme_md):
            z.write(readme_md, 'README.md')

        sample_dir = os.path.join(project_root, 'samples')
        if os.path.exists(sample_dir):
            for fname in sorted(os.listdir(sample_dir)):
                fpath = os.path.join(sample_dir, fname)
                if os.path.isfile(fpath) and fname.endswith('.nc'):
                    z.write(fpath, f'samples/{fname}')

    # Atomic move
    if os.path.exists(zip_path):
        try:
            os.remove(zip_path)
        except OSError:
            pass
    os.replace(temp_zip_path, zip_path)
    log(f"  -> Generated: {zip_path} ({os.path.getsize(zip_path):,} bytes)")

    print("\n" + "=" * 70, flush=True)
    print("PORTABLE BUNDLE BUILT SUCCESSFULLY!", flush=True)
    print(f"   • HTML: {portable_html_path}", flush=True)
    print(f"   • ZIP:  {zip_path}", flush=True)
    print("=" * 70 + "\n", flush=True)

if __name__ == '__main__':
    main()
