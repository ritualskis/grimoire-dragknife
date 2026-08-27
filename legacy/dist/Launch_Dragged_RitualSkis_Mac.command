#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if command -v open >/dev/null 2>&1 && [[ "$OSTYPE" == "darwin"* ]]; then
    open "$DIR/Dragged_RitualSkis_Portable.html"
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$DIR/Dragged_RitualSkis_Portable.html"
else
    echo "Open $DIR/Dragged_RitualSkis_Portable.html in your web browser."
fi
