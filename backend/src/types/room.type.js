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
 *   map: string,
 *   impostorCount: number,
 *   confirmEjects: boolean,
 *   emergencyMeetings: number,
 *   emergencyCooldownSec: number,
 *   meetingDurationSec: number,
 *   anonymousVotes: boolean,
 *   playerSpeed: number,
 *   crewVision: number,
 *   impostorVision: number,
 *   killCooldownSec: number,
 *   killDistance: 'short' | 'medium' | 'long',
 *   tasksPerPlayer: number
 * }} RoomSettings
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
 *   emergencyCallsLeft: number,
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
 *   confirmEjects: boolean,
 *   remainingImpostors: number,
 *   anonymousVotes: boolean,
 *   tie: boolean,
 *   skipped: boolean,
 *   counts: Record<string, number>,
 *   votes: Record<string, string>
 * }} MeetingResults
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   isPublic: boolean,
 *   region: string,
 *   map: string,
 *   started: boolean,
 *   imposter: string | null,
 *   imposters: string[],
 *   host: Player,
 *   settings: RoomSettings,
 *   players: Record<string, Player>,
 *   deadBodies: Record<string, DeadBody>,
 *   lastKillAt: number,
 *   lastEmergencyAt: number,
 *   currentMeeting: MeetingState | null
 * }} GameRoom
 */

export {};
