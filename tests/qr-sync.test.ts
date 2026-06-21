import { describe, it, expect } from "vitest";

async function compressSettings(settings: any): Promise<string> {
  const jsonStr = JSON.stringify(settings);
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([jsonStr]).stream().pipeThrough(new CompressionStream("gzip"));
    const response = new Response(stream);
    const buffer = await response.arrayBuffer();
    
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return "gz:" + btoa(binary);
  }
  return "raw:" + btoa(unescape(encodeURIComponent(jsonStr)));
}

async function decompressSettings(payload: string): Promise<any> {
  if (payload.startsWith("gz:")) {
    const base64Data = payload.slice(3);
    const binaryString = atob(base64Data);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const response = new Response(stream);
    const text = await response.text();
    return JSON.parse(text);
  } else if (payload.startsWith("raw:")) {
    const base64Data = payload.slice(4);
    const jsonText = decodeURIComponent(escape(atob(base64Data)));
    return JSON.parse(jsonText);
  } else {
    try {
      const binaryString = atob(payload);
      const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        const response = new Response(stream);
        const text = await response.text();
        return JSON.parse(text);
      }
      const jsonText = new TextDecoder().decode(bytes);
      return JSON.parse(jsonText);
    } catch (e) {
      return JSON.parse(payload);
    }
  }
}

describe("QR Sync Compression/Decompression", () => {
  it("should compress and decompress settings correctly with gzip", async () => {
    const originalSettings = {
      provider: "claude" as const,
      model: "claude-3-opus",
      analyzeWindow: 35,
      showDebug: true,
      customPromptSection1: "Custom instructions here for character details...",
      cardCommands: {
        character: "Character specific template test {{title}} with {protagonist}"
      }
    };

    const compressed = await compressSettings(originalSettings);
    expect(compressed.startsWith("gz:")).toBe(true);

    const decompressed = await decompressSettings(compressed);
    expect(decompressed).toEqual(originalSettings);
  });

  it("should fall back to raw base64 if gzip is bypassed or prefix matches raw", async () => {
    const originalSettings = {
      provider: "openai" as const,
      model: "gpt-4"
    };

    const jsonStr = JSON.stringify(originalSettings);
    const rawPayload = "raw:" + btoa(unescape(encodeURIComponent(jsonStr)));
    
    const decompressed = await decompressSettings(rawPayload);
    expect(decompressed).toEqual(originalSettings);
  });
});
