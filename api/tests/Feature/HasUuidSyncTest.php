<?php

use App\Models\Branch;
use App\Models\VehicleCategory;
use Illuminate\Support\Str;

it('gives a new record a UUID v7 id and version 1', function () {
    $branch = Branch::factory()->create();

    expect(Str::isUuid($branch->id, 7))->toBeTrue()
        ->and($branch->version)->toBe(1)
        ->and($branch->fresh()->version)->toBe(1);
});

it('keeps an id that the device generated', function () {
    $id = (string) Str::uuid7();

    $branch = Branch::factory()->create(['id' => $id]);

    expect($branch->id)->toBe($id);
    $this->assertDatabaseHas('branches', ['id' => $id]);
});

it('raises the version by one on every update', function () {
    $category = VehicleCategory::factory()->create();

    $category->update(['max_price' => 12000]);
    expect($category->fresh()->version)->toBe(2);

    $category->update(['max_price' => 15000]);
    expect($category->fresh()->version)->toBe(3);
});

it('does not raise the version when nothing changed', function () {
    $category = VehicleCategory::factory()->create();

    $category->save();

    expect($category->fresh()->version)->toBe(1);
});

it('soft deletes, keeps the row and raises the version', function () {
    $category = VehicleCategory::factory()->create();

    $category->delete();

    expect(VehicleCategory::query()->find($category->id))->toBeNull();

    $trashed = VehicleCategory::withTrashed()->find($category->id);

    expect($trashed)->not->toBeNull()
        ->and($trashed->deleted_at)->not->toBeNull()
        ->and($trashed->version)->toBe(2)
        ->and($category->version)->toBe(2);
});

it('raises the version again when a record is restored', function () {
    $category = VehicleCategory::factory()->create();
    $category->delete();

    $category->restore();

    expect($category->fresh()->version)->toBe(3)
        ->and($category->fresh()->deleted_at)->toBeNull();
});
