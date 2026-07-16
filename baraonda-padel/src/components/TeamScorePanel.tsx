import { PointScore } from '../models';

type Props = {
  team: 'A' | 'B';
  players: string[];
  games: number;
  points: PointScore;
  hasAdvantage: boolean;
  serving: boolean;
  disabled: boolean;
  onPoint: () => void;
};

export function TeamScorePanel({ team, players, games, points, hasAdvantage, serving, disabled, onPoint }: Props) {
  return <section className={`team-score team-${team.toLowerCase()}${hasAdvantage ? ' has-advantage' : ''}`}>
    <small>{serving ? '● SERVIZIO' : 'COPPIA'}</small>
    <h2>COPPIA {team}</h2>
    <p>{players.map(name => <span key={name}>{name}<br /></span>)}</p>
    <div className="team-values">
      <b>{games}<small>GAME</small></b>
      <strong aria-label={hasAdvantage ? `Vantaggio coppia ${team}` : `Punti coppia ${team}: ${points}`}>{hasAdvantage ? 'VANTAGGIO' : points}</strong>
    </div>
    <button disabled={disabled} className="point-button" onClick={onPoint}>+ PUNTO COPPIA {team}</button>
  </section>;
}
