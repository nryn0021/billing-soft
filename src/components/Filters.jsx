import {
  FaFilter,
  FaFlag,
} from "react-icons/fa";

function Filters({
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
}) {

  return (

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">

      <div className="relative group">

        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">

          <FaFilter className="text-gray-700 dark:text-white text-sm transition-all duration-300 group-focus-within:text-blue-500" />

        </div>

        <select
          className="w-full h-16 pl-12 pr-4 rounded-3xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-[#111827]/90 text-black dark:text-white backdrop-blur-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-lg transition-all duration-300 appearance-none"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value
            )
          }
        >
          <option value="all">
            All Tasks
          </option>

          <option value="pending">
            Pending Tasks
          </option>

          <option value="completed">
            Completed Tasks
          </option>

        </select>

        <div className="absolute inset-0 rounded-3xl bg-blue-500/5 opacity-0 group-focus-within:opacity-100 transition-all duration-300 pointer-events-none" />

      </div>

      <div className="relative group">

        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">

          <FaFlag className="text-gray-700 dark:text-white text-sm transition-all duration-300 group-focus-within:text-blue-500" />

        </div>

        <select
          className="w-full h-16 pl-12 pr-4 rounded-3xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-[#111827]/90 text-black dark:text-white backdrop-blur-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-lg transition-all duration-300 appearance-none"
          value={priorityFilter}
          onChange={(e) =>
            setPriorityFilter(
              e.target.value
            )
          }
        >
          <option value="all">
            All Priorities
          </option>

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

        {/* GLOW */}
        <div className="absolute inset-0 rounded-3xl bg-blue-500/5 opacity-0 group-focus-within:opacity-100 transition-all duration-300 pointer-events-none" />

      </div>

    </div>
  );
}

export default Filters;