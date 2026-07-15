import { PointScore } from '../models';

export function TeamScorePanel({ team, players, games, points, serving, disabled, onPoint }: { team: 'A' | 'B'; players: string[]; games: number; points: PointScore; serving: boolean; disabled: boolean; onPoint: () => void }) {
  return <section className={`team-score team-${team.toLowerCase()}`}><small>{serving ? '● SERVIZIO' : 'COPPIA'}</small><h2>COPPIA {team}</h2><p>{players.join('\n').split('\n').map(name => <span key={name}>{name}<br /></span>)}</p><div className="team-values"><b>{games}<small>GAME</small></b><strong>{points === 'advantage' ? 'AD' : points}</strong></div><button disabled={disabled} className="point-button" onClick={onPoint}>+ PUNTO COPPIA {team}</button></section>;
}
