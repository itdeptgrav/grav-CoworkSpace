const { initializeApp } = require("firebase/app");
const { getDatabase, ref, get } = require("firebase/database");
require('dotenv').config();

const firebaseConfig = {
    apiKey: "AIzaSyDpswQ3pSlbxtmc-yWDgJD2GQWjfpK3ZXs",
    authDomain: "grav-cms-38f45.firebaseapp.com",
    projectId: "grav-cms-38f45",
    storageBucket: "grav-cms-38f45.firebasestorage.app",
    messagingSenderId: "51268280312",
    appId: "1:51268280312:web:1667f085583f9fe4b6c00d",
    databaseURL: "https://grav-cms-38f45-default-rtdb.firebaseio.com"
};

console.log("🔍 Checking Realtime Database...");
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

async function checkEmployee() {
    const uid = "paHxne71GZQR7Qt89STzj8XHXmq2";

    try {
        // Check if employees node exists
        const employeesRef = ref(database, 'employees');
        const employeesSnapshot = await get(employeesRef);

        console.log("\n📊 Database Structure:");
        if (employeesSnapshot.exists()) {
            console.log("✅ 'employees' node exists");
            const employees = employeesSnapshot.val();
            console.log(`📋 Total employees: ${Object.keys(employees).length}`);
        } else {
            console.log("❌ 'employees' node does NOT exist!");
        }

        // Check specific employee
        console.log(`\n🔎 Checking employee with UID: ${uid}`);
        const employeeRef = ref(database, `employees/${uid}`);
        const snapshot = await get(employeeRef);

        if (snapshot.exists()) {
            console.log("✅ Employee found!");
            console.log("Employee data:", snapshot.val());
        } else {
            console.log("❌ Employee NOT found in database!");

            // Check if there are any employees at all
            if (employeesSnapshot.exists()) {
                console.log("\n📋 Available employees in database:");
                const employees = employeesSnapshot.val();
                Object.keys(employees).forEach(key => {
                    console.log(`- UID: ${key}`);
                    console.log(`  Email: ${employees[key].email}`);
                    console.log(`  Role: ${employees[key].role}`);
                    console.log(`  Active: ${employees[key].active}`);
                });
            }
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

checkEmployee();