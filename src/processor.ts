/**
 * M3U8 Manifest Processing & URL Resolution.
 */

export function resolveUrl(line: string, base: URL): URL {
    try {
        return new URL(line);
    } catch {
        return new URL(line, base);
    }
}

export function buildProxyQuery(url: URL, originParam?: string, debugEnabled = false): string {
    const params = new URLSearchParams({
        url: url.href,
    });

    if (originParam) {
        params.set("origin", originParam);
    }

    if (debugEnabled) {
        params.set("debug", "1");
    }

    return params.toString();
}

export function extractManifestDebug(textBody: string) {
    const lines = textBody.split("\n").map((line) => line.replace(/\r$/, ""));
    const streamLines = lines.filter((line) => line.startsWith("#EXT-X-STREAM-INF"));
    const codecs = streamLines
        .map((line) => line.match(/CODECS="([^"]+)"/)?.[1] ?? null)
        .filter((value): value is string => Boolean(value));

    return {
        lineCount: lines.length,
        variantCount: streamLines.length,
        codecs: [...new Set(codecs)].slice(0, 8),
        preview: lines.filter((line) => line.startsWith("#EXT")).slice(0, 8),
    };
}

export function processM3u8Line(
    line: string,
    scrapeUrl: URL,
    originParam?: string,
    debugEnabled = false,
): string {
    if (line.length === 0) return "";

    if (line[0] === "#") {
        if (line.startsWith("#EXT-X-KEY")) {
            const uriStart = line.indexOf('URI="');
            if (uriStart !== -1) {
                const keyUriStart = uriStart + 5;
                const quotePos = line.indexOf('"', keyUriStart);
                if (quotePos !== -1) {
                    const keyUri = line.slice(keyUriStart, quotePos);
                    const resolved = resolveUrl(keyUri, scrapeUrl);
                    const q = buildProxyQuery(resolved, originParam, debugEnabled);
                    return `${line.slice(0, keyUriStart)}?${q}${line.slice(quotePos)}`;
                }
            }
            return line;
        }

        if (line.startsWith('#EXT-X-MAP:URI="')) {
            const innerUrl = line.slice(16, line.length - 1);
            const resolved = resolveUrl(innerUrl, scrapeUrl);
            const q = buildProxyQuery(resolved, originParam, debugEnabled);
            return `#EXT-X-MAP:URI="?${q}"`;
        }

        if (line.length > 20 && (line.includes("URI=") || line.includes("URL="))) {
            const colonPos = line.indexOf(":");
            if (colonPos !== -1) {
                const prefix = line.slice(0, colonPos + 1);
                const attrs = line.slice(colonPos + 1);

                const rewrittenAttrs = attrs.split(",").map((attr) => {
                    const eqPos = attr.indexOf("=");
                    if (eqPos === -1) return attr;

                    const key = attr.slice(0, eqPos).trim();
                    const value = attr
                        .slice(eqPos + 1)
                        .trim()
                        .replace(/^"|"$/g, "");

                    if (key === "URI" || key === "URL") {
                        const resolved = resolveUrl(value, scrapeUrl);
                        const q = buildProxyQuery(resolved, originParam, debugEnabled);
                        return `${key}="?${q}"`;
                    }
                    return attr;
                });

                return prefix + rewrittenAttrs.join(",");
            }
        }

        return line;
    }

    const resolved = resolveUrl(line, scrapeUrl);
    const q = buildProxyQuery(resolved, originParam, debugEnabled);
    return `?${q}`;
}
