// testLogin.js (in root folder)
import bcrypt from "bcrypt";
import { pool } from "./src/connect.js"; // Fixed path

const username = "andrefullstack";
const passwordYouTyped =
  "$2b$10$S/6/XmIbsQpuBXB8kccyIevTXo2xHtFpEeOwdsu/ZtdLOfrQmoWHy"; // PUT THE EXACT PASSWORD YOU WANT TO TEST

const result = await pool.query("SELECT * FROM users WHERE username = $1", [
  username,
]);
const user = result.rows[0];

if (!user) {
  console.log("❌ User not found");
} else {
  console.log("✅ User found:", user.username);
  console.log("Password hash starts with:", user.password.substring(0, 10));

  const isMatch = await bcrypt.compare(passwordYouTyped, user.password);
  console.log("\nPassword match:", isMatch ? "✅ YES" : "❌ NO");

  if (!isMatch) {
    console.log(
      "\n⚠️  The password you typed does NOT match the hash in the database"
    );
    console.log(
      "Make sure you are typing the EXACT same password you used in hashPassword.js"
    );
  }
}

process.exit(0);
