import TaskCard from "./TaskCard";
import { FaList, FaThLarge } from "react-icons/fa";

function TaskList({
  tasks,
  deleteTask,
  toggleTaskStatus,
  editTask,
  view,
  setView,
}) {

  if (tasks.length === 0) {
    return (
      <div className="bg-white/80 dark:bg-[#0f172a]/80 backdrop-blur-xl p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl text-center transition-all duration-300">

        <h2 className="text-2xl font-bold mb-2 text-black dark:text-white">
          No Tasks Found
        </h2>

        <p className="text-gray-500 dark:text-gray-400">
          Create a task to get started.
        </p>

      </div>
    );
  }

  return (

    <div className="transition-all duration-300 w-full">

      <div className="flex justify-between items-center mb-6">

        <h2 className="text-xl font-bold text-black dark:text-white">
          Your Tasks
        </h2>

        <div className="flex gap-3">

          <button
            onClick={() =>
              setView("list")
            }
            className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-300 ${
              view === "list"
                ? "bg-blue-600 text-white shadow-lg"
                : "bg-gray-200 dark:bg-[#1e293b] text-black dark:text-white"
            }`}
          >
            <FaList />
          </button>

          <button
            onClick={() =>
              setView("card")
            }
            className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-300 ${
              view === "card"
                ? "bg-blue-600 text-white shadow-lg"
                : "bg-gray-200 dark:bg-[#1e293b] text-black dark:text-white"
            }`}
          >
            <FaThLarge />
          </button>

        </div>

      </div>

      <div
        className={`w-full transition-all duration-300 ${
          view === "card"
            ? "grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 auto-rows-fr"
            : "flex flex-col gap-5"
        }`}
      >

        {tasks.map((task) => (

          <TaskCard
            key={task.id}
            task={task}
            deleteTask={deleteTask}
            toggleTaskStatus={
              toggleTaskStatus
            }
            editTask={editTask}
            view={view}
          />

        ))}

      </div>

    </div>
  );
}

export default TaskList;