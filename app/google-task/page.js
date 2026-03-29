"use client";

import { useEffect, useState } from "react";

export default function GoogleTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    try {
      setLoading(true);

      const res = await fetch("http://localhost:5000/api/google/tasks", {
        credentials: "include",
      });

      const data = await res.json();

      if (data.success) {
        setTasks(data.data);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  return (
    <div style={{ padding: "30px", fontFamily: "Arial" }}>
      <h1 style={{ marginBottom: "20px" }}>
        Google Workspace Assigned Tasks
      </h1>

      <button
        onClick={fetchTasks}
        style={{
          padding: "8px 16px",
          marginBottom: "20px",
          cursor: "pointer",
        }}
      >
        Refresh Tasks
      </button>

      {loading ? (
        <p>Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <p>No tasks found</p>
      ) : (
        <table
          border="1"
          cellPadding="10"
          style={{ borderCollapse: "collapse", width: "100%" }}
        >
          <thead>
            <tr>
              <th>Task Title</th>
              <th>Status</th>
              <th>Task List</th>
              <th>Due Date</th>
              <th>Last Updated</th>
            </tr>
          </thead>

          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.title}</td>

                <td>
                  {task.status === "completed"
                    ? "Completed"
                    : "Pending"}
                </td>

                <td>{task.listName}</td>

                <td>
                  {task.due
                    ? new Date(task.due).toLocaleDateString()
                    : "-"}
                </td>

                <td>
                  {task.updated
                    ? new Date(task.updated).toLocaleString()
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}