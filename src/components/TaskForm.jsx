import { useState } from "react";

function TaskForm({ addTask }) {

  const [title, setTitle] =
    useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    priority,
    setPriority,
  ] = useState("Low");

  const [dueDate, setDueDate] =
    useState("");

  const handleSubmit = (e) => {

    e.preventDefault();

    if (
      !title ||
      !description ||
      !dueDate
    ) {
      alert(
        "Please fill all fields"
      );
      return;
    }

    const newTask = {
      title,
      description,
      priority,
      dueDate,
    };

    addTask(newTask);

    setTitle("");
    setDescription("");
    setPriority("Low");
    setDueDate("");
  };

  return (

    <div className="w-full h-full bg-transparent p-4 sm:p-6">

      <div className="flex items-center justify-between mb-6">

        <div>

          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-black dark:text-white">
            Create Task
          </h2>

          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Organize and manage your workflow
          </p>

        </div>

        <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 items-center justify-center shadow-lg">

          <span className="text-white text-2xl font-bold">
            +
          </span>

        </div>

      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5"
      >

        <div>

          <label className="block mb-2 text-sm font-semibold tracking-wide text-gray-700 dark:text-gray-300">
            TASK TITLE
          </label>

          <input
            type="text"
            placeholder="Enter task title..."
            className="w-full h-14 px-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-[#111827] text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-500 backdrop-blur-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
            value={title}
            onChange={(e) =>
              setTitle(
                e.target.value
              )
            }
          />

        </div>

        <div>

          <label className="block mb-2 text-sm font-semibold tracking-wide text-gray-700 dark:text-gray-300">
            DESCRIPTION
          </label>

          <textarea
            rows="5"
            placeholder="Describe your task..."
            className="w-full px-4 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-[#111827] text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-500 backdrop-blur-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 resize-none"
            value={description}
            onChange={(e) =>
              setDescription(
                e.target.value
              )
            }
          />

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div>

            <label className="block mb-2 text-sm font-semibold tracking-wide text-gray-700 dark:text-gray-300">
              PRIORITY
            </label>

            <select
              className="w-full h-14 px-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-[#111827] text-black dark:text-white backdrop-blur-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
              value={priority}
              onChange={(e) =>
                setPriority(
                  e.target.value
                )
              }
            >
              <option value="Low">
                Low
              </option>

              <option value="Medium">
                Medium
              </option>

              <option value="High">
                High
              </option>

            </select>

          </div>

          <div>

            <label className="block mb-2 text-sm font-semibold tracking-wide text-gray-700 dark:text-gray-300">
              DUE DATE
            </label>

            <input
              type="date"
              className="w-full h-14 px-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-[#111827] text-black dark:text-white backdrop-blur-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
              value={dueDate}
              onChange={(e) =>
                setDueDate(
                  e.target.value
                )
              }
            />

          </div>

        </div>

        <button
          type="submit"
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-lg font-semibold tracking-wide shadow-xl hover:shadow-blue-500/30 transition-all duration-300 hover:scale-[1.02]"
        >
          Add Task
        </button>

      </form>

    </div>
  );
}

export default TaskForm;