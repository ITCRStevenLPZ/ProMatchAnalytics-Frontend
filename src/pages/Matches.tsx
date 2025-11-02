import { Link } from 'react-router-dom';

export default function Matches() {
  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Matches</h1>
        <Link to="/matches/new" className="btn btn-primary">
          Create Match
        </Link>
      </div>

      <div className="card">
        <p className="text-gray-600">Matches list will be displayed here</p>
      </div>
    </div>
  );
}
