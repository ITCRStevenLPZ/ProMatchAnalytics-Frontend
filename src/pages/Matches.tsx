import { useTranslation } from "react-i18next";

export default function Matches() {
  const { t } = useTranslation("matches");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t("title")}</h1>
      </div>

      <div className="card">
        <p className="text-gray-600">{t("noMatches")}</p>
      </div>
    </div>
  );
}
