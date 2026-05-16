import { FaSearch } from "react-icons/fa";

function SearchBar({
  searchTerm,
  setSearchTerm,
}) {

  return (

    <div className="w-full">

      <div className="relative group">

        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">

          <FaSearch className="text-gray-700 dark:text-white text-sm transition-all duration-300 group-focus-within:text-blue-500" />

        </div>

        <input
          type="text"
          placeholder="Search tasks, priorities, descriptions..."
          className="w-full h-16 pl-12 pr-12 rounded-3xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-[#111827]/90 text-black dark:text-white placeholder-gray-400 dark:placeholder-gray-500 backdrop-blur-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-lg transition-all duration-300"
          value={searchTerm}
          onChange={(e) =>
            setSearchTerm(
              e.target.value
            )
          }
        />

        <div className="absolute inset-0 rounded-3xl bg-blue-500/5 opacity-0 group-focus-within:opacity-100 transition-all duration-300 pointer-events-none" />

      </div>

    </div>
  );
}

export default SearchBar;