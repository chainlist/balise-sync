import Database from 'better-sqlite3';
import { config } from '../config.js';
import { SCHEMA } from './schema.js';

export const db = new Database(config.databasePath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(SCHEMA);
