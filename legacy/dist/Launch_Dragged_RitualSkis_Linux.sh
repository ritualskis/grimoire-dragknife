#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$DIR/Dragged_RitualSkis_Portable.html"
elif command -v gnome-open >/dev/null 2>&1; then
    gnome-open "$DIR/Dragged_RitualSkis_Portable.html"
else
    echo "Open $DIR/Dragged_RitualSkis_Portable.html in your web browser."
fi
