'use strict';

module.exports = ({ env }) => ({
  connection: {
    client: env('DATABASE_CLIENT', 'sqlite'),
    connection: {
      // PostgreSQL (used in Docker)
      host:     env('DATABASE_HOST'),
      port:     env.int('DATABASE_PORT'),
      database: env('DATABASE_NAME'),
      user:     env('DATABASE_USERNAME'),
      password: env('DATABASE_PASSWORD'),
      ssl:      env.bool('DATABASE_SSL', false),

      // SQLite fallback (used for local development without Docker)
      filename: env('DATABASE_FILENAME', '.tmp/data.db'),
    },
    useNullAsDefault: true,
  },
});