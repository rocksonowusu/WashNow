<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
| Feature tests boot the Laravel application on a fresh in-memory database.
| Unit tests stay plain PHP.
*/

pest()->extend(TestCase::class)->use(RefreshDatabase::class)->in('Feature');
