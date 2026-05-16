import { useState } from "react";

function TaskCard({
  task,
  deleteTask,
  toggleTaskStatus,
  editTask,
  view,
}) {

  const [isEditing, setIsEditing] =
    useState(false);

  const [
    editedTitle,
    setEditedTitle,
  ] = useState(task.title);

  const [
    editedDescription,
    setEditedDescription,
  ] = useState(task.description);

  const [
    editedPriority,
    setEditedPriority,
  ] = useState(task.priority);

  const [
    editedDueDate,
    setEditedDueDate,
  ] = useState(task.dueDate);

  const handleSave = () => {

    const updatedTask = {
      ...task,
      title: editedTitle,
      description:
        editedDescription,
      priority: editedPriority,
      dueDate: editedDueDate,
    };

    editTask(updatedTask);

    setIsEditing(false);
  };

  const priorityColor =
    task.priority === "High"
      ? "bg-red-500"
      : task.priority ===
        "Medium"
      ? "bg-yellow-500"
      : "bg-green-500";

  if (view === "list") {

    return (

      <div className="bg-white/80 dark:bg-[#0f172a]/80 backdrop-blur-xl rounded-3xl border border-gray-200 dark:border-gray-800 shadow-xl p-6 transition-all duration-300 hover:shadow-blue-500/10 hover:-translate-y-1">

        {isEditing ? (

          <div className="space-y-4">

            <input
              type="text"
              value={editedTitle}
              onChange={(e) =>
                setEditedTitle(
                  e.target.value
                )
              }
              className="w-full h-14 px-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111827] text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            />

            <textarea
              rows="4"
              value={editedDescription}
              onChange={(e) =>
                setEditedDescription(
                  e.target.value
                )
              }
              className="w-full px-4 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111827] text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <select
                value={editedPriority}
                onChange={(e) =>
                  setEditedPriority(
                    e.target.value
                  )
                }
                className="w-full h-14 px-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111827] text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
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

              <input
                type="date"
                value={editedDueDate}
                onChange={(e) =>
                  setEditedDueDate(
                    e.target.value
                  )
                }
                className="w-full h-14 px-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111827] text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />

            </div>

            <div className="flex flex-wrap gap-3">

              <button
                onClick={handleSave}
                className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all duration-300 hover:scale-105"
              >
                Save
              </button>

              <button
                onClick={() =>
                  setIsEditing(false)
                }
                className="px-5 py-3 rounded-2xl bg-gray-500 hover:bg-gray-600 text-white font-medium transition-all duration-300 hover:scale-105"
              >
                Cancel
              </button>

            </div>

          </div>

        ) : (

          <div className="flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between gap-6">

            <div className="flex-1 min-w-0">

              <div
                className={`inline-flex items-center px-3 py-1 text-white text-xs font-semibold rounded-full mb-4 ${priorityColor}`}
              >
                {task.priority} Priority
              </div>

              <h2
                className={`text-2xl font-bold mb-2 text-black dark:text-white break-words ${
                  task.completed
                    ? "line-through"
                    : ""
                }`}
              >
                {task.title}
              </h2>

              <p
                className={`text-gray-600 dark:text-gray-300 mb-5 leading-relaxed break-words ${
                  task.completed
                    ? "line-through"
                    : ""
                }`}
              >
                {task.description}
              </p>

              <div className="flex flex-wrap items-center gap-4">

                <div>

                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Due Date
                  </p>

                  <p className="font-semibold text-blue-600 dark:text-blue-400">
                    {task.dueDate}
                  </p>

                </div>

                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    task.completed
                      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                  }`}
                >
                  {task.completed
                    ? "Completed"
                    : "Pending"}
                </span>

              </div>

            </div>

            <div className="flex flex-wrap gap-3 2xl:justify-end">

              <button
                onClick={() =>
                  toggleTaskStatus(
                    task.id
                  )
                }
                className={`px-5 py-3 rounded-2xl text-white font-medium transition-all duration-300 hover:scale-105 whitespace-nowrap ${
                  task.completed
                    ? "bg-yellow-500 hover:bg-yellow-600"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {task.completed
                  ? "Mark Pending"
                  : "Mark Complete"}
              </button>

              <button
                onClick={() =>
                  setIsEditing(true)
                }
                className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all duration-300 hover:scale-105"
              >
                Edit
              </button>

              <button
                onClick={() =>
                  deleteTask(task.id)
                }
                className="px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-medium transition-all duration-300 hover:scale-105"
              >
                Delete
              </button>

            </div>

          </div>

        )}

      </div>
    );
  }

  return (

    <div className="bg-white/80 dark:bg-[#0f172a]/80 backdrop-blur-xl rounded-3xl border border-gray-200 dark:border-gray-800 shadow-xl p-6 transition-all duration-300 hover:shadow-blue-500/10 hover:-translate-y-1 flex flex-col h-full">

      {isEditing ? (

        <div className="space-y-4 flex-1">

          <input
            type="text"
            value={editedTitle}
            onChange={(e) =>
              setEditedTitle(
                e.target.value
              )
            }
            className="w-full h-14 px-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111827] text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          />

          <textarea
            rows="5"
            value={editedDescription}
            onChange={(e) =>
              setEditedDescription(
                e.target.value
              )
            }
            className="w-full px-4 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111827] text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          <select
            value={editedPriority}
            onChange={(e) =>
              setEditedPriority(
                e.target.value
              )
            }
            className="w-full h-14 px-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111827] text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
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

          <input
            type="date"
            value={editedDueDate}
            onChange={(e) =>
              setEditedDueDate(
                e.target.value
              )
            }
            className="w-full h-14 px-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111827] text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex flex-wrap gap-3 pt-2">

            <button
              onClick={handleSave}
              className="flex-1 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all duration-300 hover:scale-105"
            >
              Save
            </button>

            <button
              onClick={() =>
                setIsEditing(false)
              }
              className="flex-1 px-5 py-3 rounded-2xl bg-gray-500 hover:bg-gray-600 text-white font-medium transition-all duration-300 hover:scale-105"
            >
              Cancel
            </button>

          </div>

        </div>

      ) : (

        <>
          <div className="flex-1">

            <div
              className={`inline-flex items-center px-3 py-1 text-white text-xs font-semibold rounded-full mb-4 ${priorityColor}`}
            >
              {task.priority} Priority
            </div>

            <h2
              className={`text-2xl font-bold mb-3 text-black dark:text-white break-words ${
                task.completed
                  ? "line-through"
                  : ""
              }`}
            >
              {task.title}
            </h2>

            <p
              className={`text-gray-600 dark:text-gray-300 mb-6 leading-relaxed break-words ${
                task.completed
                  ? "line-through"
                  : ""
              }`}
            >
              {task.description}
            </p>

          </div>

          <div className="mt-auto">

            <div className="mb-5">

              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                Due Date
              </p>

              <p className="font-semibold text-blue-600 dark:text-blue-400">
                {task.dueDate}
              </p>

            </div>

            <div className="mb-5">

              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  task.completed
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                }`}
              >
                {task.completed
                  ? "Completed"
                  : "Pending"}
              </span>

            </div>

            <div className="grid grid-cols-1 gap-3">

              <button
                onClick={() =>
                  toggleTaskStatus(
                    task.id
                  )
                }
                className={`w-full px-4 py-3 rounded-2xl text-white font-medium transition-all duration-300 hover:scale-[1.02] ${
                  task.completed
                    ? "bg-yellow-500 hover:bg-yellow-600"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {task.completed
                  ? "Mark Pending"
                  : "Mark Complete"}
              </button>

              <div className="grid grid-cols-2 gap-3">

                <button
                  onClick={() =>
                    setIsEditing(true)
                  }
                  className="w-full px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all duration-300 hover:scale-[1.02]"
                >
                  Edit
                </button>

                <button
                  onClick={() =>
                    deleteTask(task.id)
                  }
                  className="w-full px-4 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-medium transition-all duration-300 hover:scale-[1.02]"
                >
                  Delete
                </button>

              </div>

            </div>

          </div>

        </>
      )}

    </div>
  );
}

export default TaskCard;