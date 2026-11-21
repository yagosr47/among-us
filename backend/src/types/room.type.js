/**
 * @typedef {{ x: number, y: number, d: 'left' | 'right', moving: boolean }} PlayerState
 */

/**
 * @typedef {{
 *   id: string,
 *   type: string,
 *   title: string,
 *   room: string,
 *   x: number,
 *   y: number,
 *   completed: boolean
 * }} PlayerTask
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   roomId: string | null,
 *   socketId: string | null,
 *   state: PlayerState,
 *   color: string,
 *   isImposter: boolean,
 *   isAlive: boolean,
 *   inVent: boolean,
 *   tasks: PlayerTask[]
 * }} Player
 */

/**
 * @typedef {{
 *   id: string,
 *   color: string,
 *   name: string,
 *   x: number,
 *   y: number
 * }} DeadBody
 */

/**
 * @typedef {{
 *   isActive: boolean,
 *   type: 'emergency' | 'body',
 *   callerId: string,
 *   bodyPlayerId: string | null,
 *   votes: Record<string, string>,
 *   endTime: number,
 *   timeoutId: NodeJS.Timeout | null,
 *   results?: MeetingResults
 * }} MeetingState
 */

/**
 * @typedef {{
 *   ejectedId: string | null,
 *   ejectedName: string | null,
 *   ejectedColor: string | null,
 *   wasImposter: boolean,
 *   tie: boolean,
 *   skipped: boolean,
 *   counts: Record<string, number>,
 *   votes: Record<string, string>
 * }} MeetingResults
 */

/**
 * @typedef {{
 *   id: string,
 *   started: boolean,
 *   imposter: string | null,
 *   host: Player,
 *   players: Record<string, Player>,
 *   deadBodies: Record<string, DeadBody>,
 *   lastKillAt: number,
 *   currentMeeting: MeetingState | null
 * }} GameRoom
 */

export {};
