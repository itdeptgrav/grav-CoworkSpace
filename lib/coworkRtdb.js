import { ref, get, child, query, orderByChild, equalTo } from "firebase/database";
import { rtdb } from "./coworkFirebase";

// ... existing functions ...

// Get employee by email
export async function getEmployeeByEmail(email) {
    try {
        const employeesRef = ref(rtdb, 'employees');
        const snapshot = await get(employeesRef);

        if (snapshot.exists()) {
            const employees = snapshot.val();
            // Find employee with matching email
            const employeeEntry = Object.entries(employees).find(
                ([_, data]) => data.email === email
            );

            if (employeeEntry) {
                const [uid, data] = employeeEntry;
                return { uid, ...data };
            }
        }
        return null;
    } catch (error) {
        console.error("Error getting employee by email:", error);
        throw error;
    }
}

// Get employee by UID
export async function getEmployeeByUid(uid) {
    try {
        const employeeRef = ref(rtdb, `employees/${uid}`);
        const snapshot = await get(employeeRef);

        if (snapshot.exists()) {
            return { uid, ...snapshot.val() };
        }
        return null;
    } catch (error) {
        console.error("Error getting employee by UID:", error);
        throw error;
    }
}