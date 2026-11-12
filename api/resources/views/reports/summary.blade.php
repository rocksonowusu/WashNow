<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>WashNow report</title>
    {{-- DomPDF's bundled DejaVu Sans is used because it has the cedi sign. --}}
    <style>
        @page { margin: 28px 32px; }
        body { font-family: "DejaVu Sans", sans-serif; font-size: 11px; color: #15202B; }
        h1 { font-size: 20px; margin: 0; color: #155EA6; }
        h2 { font-size: 13px; margin: 18px 0 6px; padding: 5px 8px; background: #EBEEF0; }
        .muted { color: #5B6770; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; font-size: 10px; color: #5B6770; border-bottom: 1px solid #DCE1E4; padding: 4px 8px; }
        td { border-bottom: 1px solid #DCE1E4; padding: 5px 8px; }
        .num { text-align: right; }
        .totals td { border: 1px solid #DCE1E4; width: 25%; vertical-align: top; }
        .totals .label { font-size: 10px; color: #5B6770; }
        .totals .value { font-size: 15px; font-weight: bold; }
        .strong td { background: #155EA6; color: #FFFFFF; border-color: #155EA6; }
        .strong .label { color: #E3EEF8; }
    </style>
</head>
<body>
@php
    $money = fn (int $pesewas) => 'GH₵'.number_format($pesewas / 100, 2);
    $totals = $report['totals'];
@endphp

<h1>WashNow</h1>
<p class="muted">
    {{ $branchName }} · {{ $report['from'] === $report['to'] ? $report['from'] : $report['from'].' to '.$report['to'] }}
    · printed {{ now()->format('j M Y, g:i a') }}
</p>

<table class="totals">
    <tr class="strong">
        <td><div class="label">Total sales</div><div class="value">{{ $money($totals['sales']) }}</div></td>
        <td><div class="label">Vehicles washed</div><div class="value">{{ $totals['vehicles'] }}</div></td>
        <td><div class="label">Cash</div><div class="value">{{ $money($totals['cash']) }}</div></td>
        <td><div class="label">MoMo</div><div class="value">{{ $money($totals['momo']) }}</div></td>
    </tr>
    <tr>
        <td><div class="label">Expenses</div><div class="value">{{ $money($totals['expenses']) }}</div></td>
        <td><div class="label">Crew commission</div><div class="value">{{ $money($totals['commission']) }}</div></td>
        <td><div class="label">Left after both</div><div class="value">{{ $money($totals['net']) }}</div></td>
        <td><div class="label">Voided sales</div><div class="value">{{ $totals['voided'] }}</div></td>
    </tr>
</table>

<h2>Crew pay sheet</h2>
@if (count($report['by_crew']) === 0)
    <p class="muted">No commission in this period.</p>
@else
    <table>
        <tr><th>Name</th><th class="num">Vehicles washed</th><th class="num">Commission owed</th></tr>
        @foreach ($report['by_crew'] as $row)
            <tr><td>{{ $row['name'] }}</td><td class="num">{{ $row['vehicles'] }}</td><td class="num">{{ $money($row['commission']) }}</td></tr>
        @endforeach
    </table>
@endif

<h2>By vehicle</h2>
@if (count($report['by_vehicle']) === 0)
    <p class="muted">No sales in this period.</p>
@else
    <table>
        <tr><th>Vehicle</th><th class="num">Washed</th><th class="num">Sales</th></tr>
        @foreach ($report['by_vehicle'] as $row)
            <tr><td>{{ $row['name'] }}</td><td class="num">{{ $row['vehicles'] }}</td><td class="num">{{ $money($row['amount']) }}</td></tr>
        @endforeach
    </table>
@endif

<h2>Expenses</h2>
@if (count($report['expenses_by_category']) === 0)
    <p class="muted">No expenses in this period.</p>
@else
    <table>
        <tr><th>Spent on</th><th class="num">Amount</th></tr>
        @foreach ($report['expenses_by_category'] as $row)
            <tr><td>{{ ucfirst($row['category']) }}</td><td class="num">{{ $money($row['amount']) }}</td></tr>
        @endforeach
    </table>
@endif

<h2>Top customers</h2>
@if (count($report['top_customers']) === 0)
    <p class="muted">No sales to saved customers in this period.</p>
@else
    <table>
        <tr><th>Plate</th><th>Name</th><th class="num">Visits</th><th class="num">Spent</th></tr>
        @foreach ($report['top_customers'] as $row)
            <tr><td>{{ $row['plate_number'] }}</td><td>{{ $row['name'] ?? '' }}</td><td class="num">{{ $row['visits'] }}</td><td class="num">{{ $money($row['spent']) }}</td></tr>
        @endforeach
    </table>
@endif

@if (count($report['daily']) > 1)
    <h2>By day</h2>
    <table>
        <tr><th>Date</th><th class="num">Vehicles</th><th class="num">Sales</th><th class="num">Expenses</th></tr>
        @foreach ($report['daily'] as $day)
            <tr><td>{{ $day['date'] }}</td><td class="num">{{ $day['vehicles'] }}</td><td class="num">{{ $money($day['sales']) }}</td><td class="num">{{ $money($day['expenses']) }}</td></tr>
        @endforeach
    </table>
@endif
</body>
</html>
