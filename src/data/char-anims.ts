// Character animation definitions.
// Frame arrays reference texture atlas frame names from the loaded atlas for that entity.
// Placeholders use '__placeholder__' which Phaser silently ignores if the atlas is missing.
// Fill in real frame IDs when PixelLab sprite exports land in public/assets/sprites/.

export interface CharAnim { key: string; frameRate: number; repeat: number; frames: string[] }

export const CHAR_ANIMS: CharAnim[] = [
  // ── SOL IBARRA-CASTRO ── (atlas key: 'sol')
  { key: 'sol_idle_south',      frameRate: 4, repeat: -1, frames: ['__sol_idle_s__'] },
  { key: 'sol_idle_north',      frameRate: 4, repeat: -1, frames: ['__sol_idle_n__'] },
  { key: 'sol_idle_east',       frameRate: 4, repeat: -1, frames: ['__sol_idle_e__'] },
  { key: 'sol_idle_west',       frameRate: 4, repeat: -1, frames: ['__sol_idle_w__'] },
  { key: 'sol_walk_south',      frameRate: 8, repeat: -1, frames: ['__sol_walk_s__'] },
  { key: 'sol_walk_north',      frameRate: 8, repeat: -1, frames: ['__sol_walk_n__'] },
  { key: 'sol_walk_east',       frameRate: 8, repeat: -1, frames: ['__sol_walk_e__'] },
  { key: 'sol_walk_west',       frameRate: 8, repeat: -1, frames: ['__sol_walk_w__'] },
  { key: 'sol_terminal_south',  frameRate: 8, repeat: -1, frames: ['__sol_term_s__'] },
  { key: 'sol_enterduct_south', frameRate: 8, repeat: 0,  frames: ['__sol_duct_s__'] },
  { key: 'sol_death_south',     frameRate: 4, repeat: 0,  frames: ['__sol_death_s__'] },

  // ── NSSA ENFORCER ── (atlas key: 'enforcer')
  { key: 'enforcer_idle_south',  frameRate: 4, repeat: -1, frames: ['__enf_idle_s__'] },
  { key: 'enforcer_idle_north',  frameRate: 4, repeat: -1, frames: ['__enf_idle_n__'] },
  { key: 'enforcer_idle_east',   frameRate: 4, repeat: -1, frames: ['__enf_idle_e__'] },
  { key: 'enforcer_idle_west',   frameRate: 4, repeat: -1, frames: ['__enf_idle_w__'] },
  { key: 'enforcer_walk_south',  frameRate: 8, repeat: -1, frames: ['__enf_walk_s__'] },
  { key: 'enforcer_walk_north',  frameRate: 8, repeat: -1, frames: ['__enf_walk_n__'] },
  { key: 'enforcer_walk_east',   frameRate: 8, repeat: -1, frames: ['__enf_walk_e__'] },
  { key: 'enforcer_walk_west',   frameRate: 8, repeat: -1, frames: ['__enf_walk_w__'] },
  { key: 'enforcer_chase_south', frameRate: 8, repeat: -1, frames: ['__enf_chase_s__'] },
  { key: 'enforcer_chase_north', frameRate: 8, repeat: -1, frames: ['__enf_chase_n__'] },
  { key: 'enforcer_chase_east',  frameRate: 8, repeat: -1, frames: ['__enf_chase_e__'] },
  { key: 'enforcer_chase_west',  frameRate: 8, repeat: -1, frames: ['__enf_chase_w__'] },

  // ── EIRA-7 ── (atlas key: 'eira7')
  { key: 'eira7_idle_south',     frameRate: 4, repeat: -1, frames: ['__e7_idle_s__'] },
  { key: 'eira7_idle_north',     frameRate: 4, repeat: -1, frames: ['__e7_idle_n__'] },
  { key: 'eira7_idle_east',      frameRate: 4, repeat: -1, frames: ['__e7_idle_e__'] },
  { key: 'eira7_idle_west',      frameRate: 4, repeat: -1, frames: ['__e7_idle_w__'] },
  { key: 'eira7_walk_south',     frameRate: 8, repeat: -1, frames: ['__e7_walk_s__'] },
  { key: 'eira7_walk_north',     frameRate: 8, repeat: -1, frames: ['__e7_walk_n__'] },
  { key: 'eira7_walk_east',      frameRate: 8, repeat: -1, frames: ['__e7_walk_e__'] },
  { key: 'eira7_walk_west',      frameRate: 8, repeat: -1, frames: ['__e7_walk_w__'] },
  { key: 'eira7_terminal_south', frameRate: 8, repeat: -1, frames: ['__e7_term_s__'] },
  { key: 'eira7_runcycle_south', frameRate: 8, repeat: -1, frames: ['__e7_run_s__'] },
  { key: 'eira7_runcycle_north', frameRate: 8, repeat: -1, frames: ['__e7_run_n__'] },
  { key: 'eira7_runcycle_east',  frameRate: 8, repeat: -1, frames: ['__e7_run_e__'] },
  { key: 'eira7_runcycle_west',  frameRate: 8, repeat: -1, frames: ['__e7_run_w__'] },

  // ── ALFAR-22 ── (atlas key: 'alfar22')
  { key: 'alfar22_idle_south', frameRate: 4, repeat: -1, frames: ['__a22_idle_s__'] },
  { key: 'alfar22_idle_north', frameRate: 4, repeat: -1, frames: ['__a22_idle_n__'] },
  { key: 'alfar22_idle_east',  frameRate: 4, repeat: -1, frames: ['__a22_idle_e__'] },
  { key: 'alfar22_idle_west',  frameRate: 4, repeat: -1, frames: ['__a22_idle_w__'] },
  { key: 'alfar22_walk_south', frameRate: 8, repeat: -1, frames: ['__a22_walk_s__'] },
  { key: 'alfar22_walk_north', frameRate: 8, repeat: -1, frames: ['__a22_walk_n__'] },
  { key: 'alfar22_walk_east',  frameRate: 8, repeat: -1, frames: ['__a22_walk_e__'] },
  { key: 'alfar22_walk_west',  frameRate: 8, repeat: -1, frames: ['__a22_walk_w__'] },

  // ── RESIDENT ── (atlas key: 'resident')
  { key: 'resident_idle_south', frameRate: 4, repeat: -1, frames: ['__res_idle_s__'] },
  { key: 'resident_idle_north', frameRate: 4, repeat: -1, frames: ['__res_idle_n__'] },
  { key: 'resident_idle_east',  frameRate: 4, repeat: -1, frames: ['__res_idle_e__'] },
  { key: 'resident_idle_west',  frameRate: 4, repeat: -1, frames: ['__res_idle_w__'] },
  { key: 'resident_walk_south', frameRate: 8, repeat: -1, frames: ['__res_walk_s__'] },
  { key: 'resident_walk_north', frameRate: 8, repeat: -1, frames: ['__res_walk_n__'] },
  { key: 'resident_walk_east',  frameRate: 8, repeat: -1, frames: ['__res_walk_e__'] },
  { key: 'resident_walk_west',  frameRate: 8, repeat: -1, frames: ['__res_walk_w__'] },

  // ── ADMINISTRATOR ── (atlas key: 'administrator')
  { key: 'administrator_idle_south', frameRate: 4, repeat: -1, frames: ['__adm_idle_s__'] },
  { key: 'administrator_walk_south', frameRate: 8, repeat: -1, frames: ['__adm_walk_s__'] },
  { key: 'administrator_walk_north', frameRate: 8, repeat: -1, frames: ['__adm_walk_n__'] },
  { key: 'administrator_walk_east',  frameRate: 8, repeat: -1, frames: ['__adm_walk_e__'] },
  { key: 'administrator_walk_west',  frameRate: 8, repeat: -1, frames: ['__adm_walk_w__'] },

  // ── MED-0 / MNT ── (atlas key: 'med0')
  { key: 'med0_idle_south', frameRate: 4, repeat: -1, frames: ['__med_idle_s__'] },
  { key: 'med0_walk_south', frameRate: 8, repeat: -1, frames: ['__med_walk_s__'] },
  { key: 'med0_walk_north', frameRate: 8, repeat: -1, frames: ['__med_walk_n__'] },
  { key: 'med0_walk_east',  frameRate: 8, repeat: -1, frames: ['__med_walk_e__'] },
  { key: 'med0_walk_west',  frameRate: 8, repeat: -1, frames: ['__med_walk_w__'] },

  // ── LOGI-9 CARGO ── (atlas key: 'logi9')
  { key: 'logi9_idle_south', frameRate: 4, repeat: -1, frames: ['__lg9_idle_s__'] },
  { key: 'logi9_walk_south', frameRate: 8, repeat: -1, frames: ['__lg9_walk_s__'] },
  { key: 'logi9_walk_north', frameRate: 8, repeat: -1, frames: ['__lg9_walk_n__'] },
  { key: 'logi9_walk_east',  frameRate: 8, repeat: -1, frames: ['__lg9_walk_e__'] },
  { key: 'logi9_walk_west',  frameRate: 8, repeat: -1, frames: ['__lg9_walk_w__'] },

  // ── MITE-3 VARIANTS ── (atlas keys: 'mite3_a' through 'mite3_d', 'mite3_canister')
  { key: 'mite3a_idle_south', frameRate: 6, repeat: -1, frames: ['__m3a_idle_s__'] },
  { key: 'mite3a_walk_south', frameRate: 8, repeat: -1, frames: ['__m3a_walk_s__'] },
  { key: 'mite3b_idle_south', frameRate: 6, repeat: -1, frames: ['__m3b_idle_s__'] },
  { key: 'mite3b_walk_south', frameRate: 8, repeat: -1, frames: ['__m3b_walk_s__'] },
  { key: 'mite3c_idle_south', frameRate: 6, repeat: -1, frames: ['__m3c_idle_s__'] },
  { key: 'mite3d_idle_south', frameRate: 6, repeat: -1, frames: ['__m3d_idle_s__'] },

  // ── LUCKY (8-directional) ── (atlas key: 'lucky')
  { key: 'lucky_idle_south',     frameRate: 4, repeat: -1, frames: ['__lk_idle_s__'] },
  { key: 'lucky_idle_north',     frameRate: 4, repeat: -1, frames: ['__lk_idle_n__'] },
  { key: 'lucky_idle_east',      frameRate: 4, repeat: -1, frames: ['__lk_idle_e__'] },
  { key: 'lucky_idle_west',      frameRate: 4, repeat: -1, frames: ['__lk_idle_w__'] },
  { key: 'lucky_idle_northeast', frameRate: 4, repeat: -1, frames: ['__lk_idle_ne__'] },
  { key: 'lucky_idle_northwest', frameRate: 4, repeat: -1, frames: ['__lk_idle_nw__'] },
  { key: 'lucky_idle_southeast', frameRate: 4, repeat: -1, frames: ['__lk_idle_se__'] },
  { key: 'lucky_idle_southwest', frameRate: 4, repeat: -1, frames: ['__lk_idle_sw__'] },
  { key: 'lucky_walk_south',     frameRate: 8, repeat: -1, frames: ['__lk_walk_s__'] },
  { key: 'lucky_walk_north',     frameRate: 8, repeat: -1, frames: ['__lk_walk_n__'] },
  { key: 'lucky_walk_east',      frameRate: 8, repeat: -1, frames: ['__lk_walk_e__'] },
  { key: 'lucky_walk_west',      frameRate: 8, repeat: -1, frames: ['__lk_walk_w__'] },

  // ── FORM-8 / FORM-9 (48×48) ── (atlas keys: 'form8', 'form9')
  { key: 'form8_idle_south', frameRate: 4, repeat: -1, frames: ['__f8_idle_s__'] },
  { key: 'form9_idle_south', frameRate: 4, repeat: -1, frames: ['__f9_idle_s__'] },

  // ── VENT-4 TERMINAL ── (atlas key: 'vent4terminal')
  { key: 'vent4terminal_idle_south', frameRate: 4, repeat: -1, frames: ['__v4t_idle_s__'] },
];
