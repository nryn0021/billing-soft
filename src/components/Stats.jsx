import {
  FaTasks,
  FaClock,
  FaCheckCircle,
} from "react-icons/fa";

function Stats({ tasks }) {

  const totalTasks = tasks.length;

  const completedTasks =
    tasks.filter(
      (task) => task.completed
    ).length;

  const pendingTasks =
    tasks.filter(
      (task) => !task.completed
    ).length;

  const stats = [
    {
      title: "Total Tasks",
      value: totalTasks,
      icon: <FaTasks />,
      gradient:
        "from-blue-500 to-cyan-500",
      glow:
        "hover:shadow-blue-500/30",
    },

    {
      title: "Pending Tasks",
      value: pendingTasks,
      icon: <FaClock />,
      gradient:
        "from-yellow-400 to-orange-500",
      glow:
        "hover:shadow-yellow-500/30",
    },

    {
      title: "Completed Tasks",
      value: completedTasks,
      icon: <FaCheckCircle />,
      gradient:
        "from-green-500 to-emerald-500",
      glow:
        "hover:shadow-green-500/30",
    },
  ];

  return (

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">

      {stats.map((stat, index) => (

        <div
          key={index}
          className={`relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br ${stat.gradient} text-white shadow-2xl transition-all duration-300 hover:-translate-y-1 ${stat.glow}`}
        >

          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-10 translate-x-10" />

          <div className="relative z-10 flex items-center justify-between">

            <div>

              <p className="text-sm uppercase tracking-widest font-medium text-white/80 mb-2">
                {stat.title}
              </p>

              <h2 className="text-4xl font-black tracking-tight">
                {stat.value}
              </h2>

            </div>

            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center text-2xl shadow-lg">

              {stat.icon}

            </div>

          </div>

        </div>

      ))}

    </div>
  );
}

export default Stats;