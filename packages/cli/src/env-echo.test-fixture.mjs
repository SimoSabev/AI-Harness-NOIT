// Test fixture for verify-ladder.test.ts: prints its argv and which SUPABASE_* variables it received.
process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), supabase: Object.keys(process.env).filter((k) => k.startsWith("SUPABASE_")), keep: process.env.KEEP }));
