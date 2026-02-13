import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { UserCog } from "lucide-react";

export default function AdminDashboard() {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();

  const managementCards = [
    {
      id: "users",
      title: t("userManagement"),
      description: "Manage user roles and permissions",
      icon: UserCog,
      color: "bg-indigo-500",
      hoverColor: "hover:bg-indigo-600",
      path: "/admin/users",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">{t("dashboard")}</h1>
          <p className="mt-2 text-sm text-gray-600">
            User administration panel
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Administration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {managementCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.id}
                  onClick={() => navigate(card.path)}
                  className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 p-6 text-left group"
                >
                  <div className="flex items-start space-x-4">
                    <div
                      className={`flex-shrink-0 ${card.color} ${card.hoverColor} rounded-lg p-3 transition-colors group-hover:scale-110 transform duration-200`}
                    >
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {card.title}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {card.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-sm font-medium text-gray-500 group-hover:text-gray-700">
                    Manage
                    <svg
                      className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
