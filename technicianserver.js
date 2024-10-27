import express from "express";
import pg from "pg";
import session from "express-session";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Initialize environment variables
dotenv.config();

// Get __dirname equivalent in ES modules
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const port = process.env.PORT || 5000;


// Set EJS as the templating engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware Setup
app.use(express.urlencoded({ extended: true })); // Replaced bodyParser
app.use(express.static(path.join(__dirname, "public")));

app.use(
    session({
      secret: process.env.SESSION_SECRET || "your_secret_key",
      resave: false,
      saveUninitialized: false,
      cookie: { 
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
        httpOnly: true,
        maxAge: 30 * 60 * 1000 // 30 minutes
      },
    })
  );

  // Middleware to set cache headers
function nocache(req, res, next) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  }

  // Apply nocache middleware to all routes
app.use(nocache);


// Database Connection Setup
const db = new pg.Client({
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "studentsdata",
    password: process.env.DB_PASSWORD || "9813081155",
    port: process.env.DB_PORT || 5432,
  });

  db.connect()
  .then(() => console.log("Connected to PostgreSQL database."))
  .catch((err) => console.error("Database connection error:", err));

// Authentication Middleware
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    res.locals.user = req.session.user; // Make user data available to views
    next();
  } else {
    res.redirect("/");
  }
}

// Home Route - Serve Login Page
app.get("/", (req, res) => {
    if (req.session.user) {
      res.redirect("technician.html");
    } else {
      res.sendFile(path.join(__dirname, "public", "technician.html"));
    }
  });

  // Login Route
app.post("/Login", async (req, res) => {
    const email = req.body.username.toUpperCase();
    const password = req.body.password;
  
    try {
      const result = await db.query(
        "SELECT * FROM technician WHERE (regno) = $1",
        [email]
      );
  
      if (result.rows.length > 0) {
        const user = result.rows[0];
        if (password === user.password) { // Note: Consider hashing passwords for security
          req.session.user = { id: user.id, regno: user.regno };
          res.redirect("./technicianpage.html");
        } else {
          res.send("Incorrect Password");
        }
      } else {
        res.send("User not found");
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("An error occurred during login."+err);
    }
  });

  // API to Get User Registration Number
app.get("/api/user/regno", isAuthenticated, (req, res) => {
    res.json({ regno: req.session.user.regno });
  });

  // Logout Route
  app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error(err);
      }
      // Clear all client-side storage
      res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
      // Prevent caching of this page
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.redirect("technician.html");
    });
  });

  // Fetch Student Complaints and Render Using EJS
app.get("/complaints/students", isAuthenticated, async (req, res) => {
    const regno = req.session.user.regno;
  
    // Define the formatDate function
    const formatDate = (dateString) => {
      const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true, // Change to false for 24-hour format
        // timeZone: 'Asia/Kolkata' // Uncomment and set to desired timezone if needed
      };
      return new Date(dateString).toLocaleString('en-US', options);
    };
  
    try {
        const result = await db.query(`
     SELECT 
    cd.id, 
    sd.regno, 
    cd.email, 
    cd.hostel, 
    cd.floorno, 
    cd.roomno, 
    cd.phoneno, 
    cd.description, 
    cd.created_at, 
    cd.status 
FROM 
    complaintdata cd
JOIN 
    students sd ON UPPER(cd.regno) = UPPER(sd.regno)
ORDER BY 
    CASE 
        WHEN cd.status = 'Unsolved' THEN 0 
        ELSE 1 
    END, 
    cd.created_at DESC;
        `);
        
        const complaints = result.rows;

      if (result.rows.length > 0) {
        res.render("complaintsHistory", { 
          complaints: result.rows,
          formatDate: formatDate // Pass the function to EJS
        });
      } else {
        res.render("complaintsHistory", { 
          complaints: [], 
          message: "Looks like you haven't submitted any complaints yet.",
          formatDate: formatDate // Pass the function even if no complaints
        });
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("An error occurred while retrieving data."+err);
    }
  });
    
  app.post("/markAsSolved/:id", isAuthenticated, async (req, res) => {
    const complaintId = req.params.id;

    try {
        // Update the status to 'Solved' for the given complaint ID
        const query = `UPDATE complaintdata SET status = 'Solved' WHERE id = $1`;
        const result = await db.query(query, [complaintId]);

        // Check if any rows were updated
        if (result.rowCount === 0) {
            return res.status(404).send("Complaint not found or unauthorized.");
        }

        // Redirect to a generic complaints page or the relevant technician page
        res.redirect("/complaints/students"); // Update this as needed
    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred while updating the complaint status.");
    }
});

// Start the Server
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
  