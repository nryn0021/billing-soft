import { FaMoon, FaSun } from "react-icons/fa";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import TaskForm from "./components/TaskForm";
import TaskList from "./components/TaskList";
import SearchBar from "./components/SearchBar";
import Filters from "./components/Filters";
import Stats from "./components/Stats";

function App() {
  const [tasks, setTasks] = useState(() => {
    const storedTasks = localStorage.getItem("tasks");

    return storedTasks
      ? JSON.parse(storedTasks)
      : [];
  });

  const [searchTerm, setSearchTerm] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [
    priorityFilter,
    setPriorityFilter,
  ] = useState("all");

  const [darkMode, setDarkMode] =
    useState(false);

  const [view, setView] =
    useState("card");

  useEffect(() => {
    const savedTheme =
      localStorage.getItem(
        "darkMode"
      );

    if (savedTheme === "true") {
      setDarkMode(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "tasks",
      JSON.stringify(tasks)
    );
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem(
      "darkMode",
      darkMode
    );
  }, [darkMode]);

  const addTask = (task) => {
    const newTask = {
      id: uuidv4(),
      ...task,
      completed: false,
    };

    setTasks([
      newTask,
      ...tasks,
    ]);
  };

  const deleteTask = (id) => {
    const confirmDelete =
      window.confirm(
        "Are you sure you want to delete this task?"
      );

    if (confirmDelete) {
      setTasks(
        tasks.filter(
          (task) =>
            task.id !== id
        )
      );
    }
  };

  const toggleTaskStatus = (id) => {
    setTasks(
      tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              completed:
                !task.completed,
            }
          : task
      )
    );
  };

  const editTask = (
    updatedTask
  ) => {
    setTasks(
      tasks.map((task) =>
        task.id ===
        updatedTask.id
          ? updatedTask
          : task
      )
    );
  };

  const filteredTasks =
    tasks.filter((task) => {
      const matchesSearch =
        task.title
          .toLowerCase()
          .includes(
            searchTerm.toLowerCase()
          ) ||
        task.description
          .toLowerCase()
          .includes(
            searchTerm.toLowerCase()
          );

      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter ===
            "completed"
          ? task.completed
          : !task.completed;

      const matchesPriority =
        priorityFilter ===
        "all"
          ? true
          : task.priority ===
            priorityFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPriority
      );
    });

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen w-full bg-gradient-to-br from-gray-100 via-blue-50 to-purple-100 dark:from-[#06142b] dark:via-[#0a1931] dark:to-[#111827] text-black dark:text-white transition-all duration-500 px-3 py-4 sm:px-6 lg:px-10">
        
        <div className="w-full mx-auto">

          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5 mb-8">

            <div>
              <h1 className="text-3xl sm:text-5xl xl:text-6xl font-black tracking-tight">
                <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                  Task Dashboard
                </span>
              </h1>

              <p className="text-gray-600 dark:text-gray-400 mt-2 text-sm sm:text-base">
                Smart workflow management system
              </p>
            </div>

            <button
              onClick={() =>
                setDarkMode(
                  !darkMode
                )
              }
              className={`w-16 h-8 flex items-center rounded-full p-1 transition-all duration-300 shadow-lg ${
                darkMode
                  ? "bg-blue-600"
                  : "bg-gray-300"
              }`}
            >
              <div
                className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-all duration-300 flex items-center justify-center ${
                  darkMode
                    ? "translate-x-8"
                    : ""
                }`}
              >
                {darkMode ? (
                  <FaSun className="text-yellow-500 text-xs" />
                ) : (
                  <FaMoon className="text-gray-700 text-xs" />
                )}
              </div>
            </button>

          </div>

          <div className="mb-8">
            <Stats tasks={tasks} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">

            <div className="xl:col-span-4 flex">

              <div className="backdrop-blur-xl bg-white/70 dark:bg-[#0f172a]/80 border border-white/20 dark:border-gray-800 rounded-3xl shadow-2xl p-2 w-full h-full">

                <TaskForm addTask={addTask} />

              </div>

            </div>

            <div className="xl:col-span-8 flex flex-col gap-6">

              <div className="backdrop-blur-xl bg-white/70 dark:bg-[#0f172a]/80 border border-white/20 dark:border-gray-800 rounded-3xl shadow-2xl p-4">

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-center">

                  <div className="xl:col-span-5">

                    <SearchBar
                      searchTerm={
                        searchTerm
                      }
                      setSearchTerm={
                        setSearchTerm
                      }
                    />

                  </div>

                  <div className="xl:col-span-7">

                    <Filters
                      statusFilter={
                        statusFilter
                      }
                      setStatusFilter={
                        setStatusFilter
                      }
                      priorityFilter={
                        priorityFilter
                      }
                      setPriorityFilter={
                        setPriorityFilter
                      }
                    />

                  </div>

                </div>

              </div>

              <div className="backdrop-blur-xl bg-white/70 dark:bg-[#0f172a]/80 border border-white/20 dark:border-gray-800 rounded-3xl shadow-2xl p-4 min-h-[500px]">

                <TaskList
                  view={view}
                  setView={setView}
                  tasks={filteredTasks}
                  deleteTask={deleteTask}
                  toggleTaskStatus={
                    toggleTaskStatus
                  }
                  editTask={editTask}
                />

              </div>

            </div>

          </div>

        </div>
      </div>
    </div>
  );
}

export default App;