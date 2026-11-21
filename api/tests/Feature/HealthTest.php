<?php

it('reports the API as healthy', function () {
    $this->getJson('/api/health')
        ->assertOk()
        ->assertExactJson(['status' => 'ok']);
});

it('allows the frontend origin through CORS', function () {
    $origin = config('cors.allowed_origins')[0];

    $this->getJson('/api/health', ['Origin' => $origin])
        ->assertOk()
        ->assertHeader('Access-Control-Allow-Origin', $origin);
});

it('does not allow other origins through CORS', function () {
    // With one allowed origin the header is always that origin, so a browser
    // on any other site sees a mismatch and blocks the response.
    $response = $this->getJson('/api/health', ['Origin' => 'https://example.com']);

    expect($response->headers->get('Access-Control-Allow-Origin'))
        ->not->toBe('https://example.com')
        ->not->toBe('*');
});

it('answers a visit to the bare API address with JSON, not a web page', function () {
    $this->get('/')
        ->assertOk()
        ->assertJsonPath('name', 'WashNow API');
});

it('limits how many requests one address can make in a minute', function () {
    foreach (range(1, 120) as $ignored) {
        $this->getJson('/api/health')->assertOk();
    }

    $this->getJson('/api/health')->assertStatus(429);
});
