#!/bin/bash

# --- 1. Environment setup ---
base_url="https://pdfking.net"
output_file="sitemap.xml"

echo '<?xml version="1.0" encoding="UTF-8"?>' > "$output_file"
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' >> "$output_file"

# --- 2. Priority mapping ---
declare -A priorities
priorities=(
    ["index.html"]="1.0"
    ["merge.html"]="0.9"
    ["split.html"]="0.9"
    ["compress.html"]="0.9"
    ["flatten.html"]="0.9"
    ["rotate.html"]="0.9"
    ["protect.html"]="0.9"
    ["unlock.html"]="0.9"
    ["sign.html"]="0.9"
    ["delete.html"]="0.8"
    ["metadata.html"]="0.8"
    ["watermark.html"]="0.8"
    ["page-numbers.html"]="0.8"
    ["fill.html"]="0.8"
    ["crop.html"]="0.8"
    ["redact.html"]="0.8"
    ["annotate.html"]="0.8"
    ["ocr.html"]="0.8"
    ["pdf-to-img.html"]="0.7"
    ["img-to-pdf.html"]="0.7"
    ["extract-text.html"]="0.7"
    ["image-editor.html"]="0.6"
    ["video-studio.html"]="0.6"
    ["how-to-password-protect-a-pdf.html"]="0.8"
    ["how-to-merge-pdf-files.html"]="0.8"
    ["how-to-sign-a-pdf.html"]="0.8"
    ["how-to-split-a-pdf.html"]="0.8"
    ["how-to-remove-password-from-pdf.html"]="0.8"
    ["how-to-convert-pdf-to-image.html"]="0.7"
    ["how-to-rotate-and-organize-pdf.html"]="0.7"
    ["how-to-crop-a-pdf.html"]="0.7"
)

# --- 3. File processing ---
for file in *.html; do
    [ -e "$file" ] || continue

    if [ "$file" == "privacy.html" ] || [ "$file" == "terms.html" ]; then
        continue
    fi

    if [[ "$OSTYPE" == "darwin"* ]]; then
        last_mod=$(stat -f "%Sm" -t "%Y-%m-%d" "$file")
    else
        last_mod=$(stat -c "%y" "$file" | cut -d' ' -f1)
    fi

    priority="${priorities[$file]:-0.5}"

    if [ "$file" == "index.html" ]; then
        url_path="${base_url}/"
    else
        url_path="${base_url}/${file}"
    fi

    # --- 4. Sitemap construction ---
    echo "    <url>" >> "$output_file"
    echo "        <loc>${url_path}</loc>" >> "$output_file"
    echo "        <lastmod>${last_mod}</lastmod>" >> "$output_file"
    echo "        <priority>${priority}</priority>" >> "$output_file"
    echo "    </url>" >> "$output_file"
done

echo "</urlset>" >> "$output_file"

echo "Sitemap generated successfully at ${output_file}."