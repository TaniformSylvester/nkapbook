import { types } from "pg";
// Read bigint and numeric as JS numbers in tests (amounts are whole FCFA, far below 2^53).
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));
