export interface TelemetryPayload {
    modelsCount: number;
    edgesCount: number;
    fatalCount: number;
}

export async function sendTelemetry(payload: TelemetryPayload) {
    const apiKey = process.env.ANCYCLE_API_KEY;
    if (!apiKey) return;

    // Default to local Astro server for development if URL not provided
    const url = process.env.ANCYCLE_API_URL || 'http://localhost:4321/api/telemetry';

    try {
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        // Telemetry failure should not break the CLI tool
    }
}
