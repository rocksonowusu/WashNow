<?php

namespace App\Sync;

/**
 * Remembers, for the length of one request, that a record a device made
 * offline turned out to exist already under another id. Later items in the
 * same batch that point at the device's id are quietly pointed at the real
 * one, so a sale is not lost because its crew member was added twice.
 */
class IdAliases
{
    /** @var array<string, string> */
    private array $map = [];

    public function add(string $deviceId, string $realId): void
    {
        $this->map[$deviceId] = $realId;
    }

    public function resolve(string $id): string
    {
        return $this->map[$id] ?? $id;
    }
}
