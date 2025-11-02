import { Link } from 'react-router-dom';

export default function Teams() {
  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Teams</h1>
        <Link to="/teams/new" className="btn btn-primary">
          Add Team
        </Link>
      </div>

      <div className="card">
        <p className="text-gray-600">Teams list will be displayed here</p>
      </div>
    </div>
  );
}
