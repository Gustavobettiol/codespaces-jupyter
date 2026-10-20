import { db, migrate } from "./db.js";

try {
  migrate();
  console.log("Base de datos lista.");
} finally {
  db.close();
}