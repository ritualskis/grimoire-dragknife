#!/usr/bin/env python3
"""
Drag Knife G-Code Post-Processor CLI
======================================
Compensates G-code contours for drag knife blade trailing offset (e)
by driving the spindle ahead of target vectors and inserting stationary
corner swivel arcs (G2/G3) at acute corner vertices.

Usage:
    python3 drag_knife_postprocessor.py input.gcode -o output_dragknife.gcode --offset 1.588 --min-angle 15
"""

import math
import argparse
import sys
import re

class DragKnifeCLIProcessor:
    def __init__(self, blade_offset=1.80, min_angle_deg=12.0, enable_lead_in=True,
                 lead_in_mult=1.25, enable_overcut=True, enable_z_lift=True,
                 z_lift_height=0.8, swivel_feed=400.0, deduplicate_multi_pass=True,
                 override_cut_feed=True, cut_feed=1150.0, plunge_feed=500.0,
                 enable_corner_slowdown=True, corner_slowdown_feed=500.0,
                 corner_slowdown_dist=5.0, retract_height=None,
                 lead_in_style='straight', lead_in_radius=None,
                 cut_depth=None):
        self.blade_offset = blade_offset
        self.min_swivel_rad = math.radians(min_angle_deg)
        self.enable_lead_in = enable_lead_in
        self.lead_in_mult = lead_in_mult
        self.enable_overcut = enable_overcut
        self.enable_z_lift = enable_z_lift
        self.z_lift_height = z_lift_height
        self.swivel_feed = swivel_feed
        self.deduplicate_multi_pass = deduplicate_multi_pass
        self.override_cut_feed = override_cut_feed
        self.cut_feed = cut_feed
        self.plunge_feed = plunge_feed
        self.enable_corner_slowdown = enable_corner_slowdown
        self.corner_slowdown_feed = corner_slowdown_feed
        self.corner_slowdown_dist = corner_slowdown_dist
        self.retract_height = retract_height
        self.lead_in_style = lead_in_style
        self.lead_in_radius = lead_in_radius
        self.cut_depth = cut_depth

    def normalize_angle(self, ang):
        while ang > math.pi: ang -= math.pi * 2
        while ang < -math.pi: ang += math.pi * 2
        return ang

    def dist_to_segment(self, px, py, x1, y1, x2, y2):
        dx = x2 - x1
        dy = y2 - y1
        lensq = dx * dx + dy * dy
        if lensq < 1e-12:
            return math.hypot(px - x1, py - y1)
        t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / lensq))
        proj_x = x1 + t * dx
        proj_y = y1 + t * dy
        return math.hypot(px - proj_x, py - proj_y)

    def is_contour_closed(self, contour, unit_str):
        if not contour:
            return False
        if contour.get('is_closed'):
            return True
        segs = contour.get('segs', [])
        if not segs or len(segs) < 2:
            return False
        tol = 0.085 if unit_str == 'G20' else 2.15

        f_pt = segs[0]
        l_pt = segs[-1]

        # 1. Direct endpoint gap
        if math.hypot(f_pt['x1'] - l_pt['x2'], f_pt['y1'] - l_pt['y2']) <= tol:
            return True

        # 2. Traversal closure check (loop return after completing >= 70% of perimeter)
        total_len = sum(s.get('length', 0.0) for s in segs)
        if total_len < tol * 2.0:
            return False

        accum_len = 0.0
        for s in segs:
            accum_len += s.get('length', 0.0)
            if accum_len > total_len * 0.70:
                if math.hypot(f_pt['x1'] - s['x2'], f_pt['y1'] - s['y2']) <= tol or \
                   self.dist_to_segment(f_pt['x1'], f_pt['y1'], s['x1'], s['y1'], s['x2'], s['y2']) <= tol:
                    return True

        return False

    def stitch_contiguous_contours(self, contours, unit_str):
        if not contours or len(contours) < 2:
            return contours
        tol = 0.080 if unit_str == 'G20' else 2.0
        stitched = [contours[0]]

        for i in range(1, len(contours)):
            curr = contours[i]
            last_contour = stitched[-1]
            last_segs = last_contour.get('segs', [])
            curr_segs = curr.get('segs', [])
            if not last_segs or not curr_segs:
                stitched.append(curr)
                continue

            is_already_closed = last_contour.get('is_closed') or self.is_contour_closed(last_contour, unit_str)
            end_pt = last_segs[-1]
            start_pt = curr_segs[0]
            d = math.hypot(end_pt['x2'] - start_pt['x1'], end_pt['y2'] - start_pt['y1'])

            if d <= tol and not is_already_closed:
                last_contour['segs'].extend(curr_segs)
                if self.is_contour_closed(last_contour, unit_str):
                    last_contour['is_closed'] = True
            else:
                stitched.append(curr)

        for c in stitched:
            if not c.get('is_closed') and self.is_contour_closed(c, unit_str):
                c['is_closed'] = True

        return stitched

    def deduplicate_2d_contours(self, contours, unit_str):
        if not contours or len(contours) < 2:
            return contours
        tol = 0.08 if unit_str == 'G20' else 2.0
        unique = []

        for c in contours:
            segs = c.get('segs', [])
            if not segs:
                continue

            min_x, max_x = float('inf'), float('-inf')
            min_y, max_y = float('inf'), float('-inf')
            total_len = 0.0
            for s in segs:
                min_x = min(min_x, s['x1'], s['x2'])
                max_x = max(max_x, s['x1'], s['x2'])
                min_y = min(min_y, s['y1'], s['y2'])
                max_y = max(max_y, s['y1'], s['y2'])
                total_len += s['length']

            is_dup = False
            for prev in unique:
                pb = prev['_bounds']
                bounds_match = (abs(min_x - pb['min_x']) < tol and
                                abs(max_x - pb['max_x']) < tol and
                                abs(min_y - pb['min_y']) < tol and
                                abs(max_y - pb['max_y']) < tol)
                len_match = abs(total_len - prev['_total_len']) / max(1.0, total_len) < 0.05

                if bounds_match and len_match:
                    is_dup = True
                    prev_min_z = min(s.get('z2', 0.0) for s in prev['segs'])
                    curr_min_z = min(s.get('z2', 0.0) for s in segs)
                    if curr_min_z < prev_min_z:
                        for s in prev['segs']:
                            s['z2'] = curr_min_z
                            s['z1'] = curr_min_z
                        prev['z_depth'] = curr_min_z
                    break

            if not is_dup:
                c['_bounds'] = {'min_x': min_x, 'max_x': max_x, 'min_y': min_y, 'max_y': max_y}
                c['_total_len'] = total_len
                unique.append(c)

        return unique

    def filter_pendulum_ramps(self, segs, unit_str):
        if not segs: return []
        tol = 0.006 if unit_str == 'G20' else 0.15
        min_move = 0.0002 if unit_str == 'G20' else 0.005
        max_ramp_len = 0.60 if unit_str == 'G20' else 15.0
        clean = []
        i = 0
        while i < len(segs):
            s = segs[i]
            if s['length'] <= min_move:
                i += 1
                continue
            ramp_end = -1
            max_extent = 0.0
            for k in range(i + 1, min(i + 8, len(segs))):
                ret_seg = segs[k]
                max_extent = max(max_extent,
                    math.hypot(ret_seg['x1'] - s['x1'], ret_seg['y1'] - s['y1']),
                    math.hypot(ret_seg['x2'] - s['x1'], ret_seg['y2'] - s['y1'])
                )
                if max_extent > max_ramp_len:
                    break
                dot = math.cos(s['angle']) * math.cos(ret_seg['angle']) + math.sin(s['angle']) * math.sin(ret_seg['angle'])
                has_z_descent = (ret_seg.get('z2') is not None and s.get('z1') is not None and ret_seg['z2'] < s['z1'] - 0.0001) or \
                                (s.get('z1') is not None and s.get('z2') is not None and s['z2'] < s['z1'] - 0.0001) or \
                                (ret_seg.get('z1') is not None and ret_seg.get('z2') is not None and ret_seg['z2'] < ret_seg['z1'] - 0.0001)
                if dot < -0.82 and math.hypot(ret_seg['x2'] - s['x1'], ret_seg['y2'] - s['y1']) < tol and (has_z_descent or i == 0):
                    ramp_end = k
                    break
            if ramp_end != -1:
                i = ramp_end + 1
                continue
            clean.append(s)
            i += 1
        return clean

    def process_file(self, input_path, output_path):
        with open(input_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()

        cur_x, cur_y, cur_z = 0.0, 0.0, 0.0
        feedrate = 1000.0
        abs_mode = True
        unit_str = "G21"

        # Contour extractor
        contours = []
        cur_contour = None
        retracts = []
        plunges = []
        plunge_feeds = []
        cut_feeds = []

        for line in lines:
            clean = re.sub(r'\(.*?\)|;.*', '', line).strip().upper()
            if not clean:
                continue

            if 'G20' in clean: unit_str = 'G20'
            if 'G21' in clean: unit_str = 'G21'
            if 'G90' in clean: abs_mode = True
            if 'G91' in clean: abs_mode = False

            words = {}
            for m in re.finditer(r'([A-Z])\s*([-+]?\d*\.?\d+)', clean):
                words[m.group(1)] = float(m.group(2))

            g_val = int(words['G']) if 'G' in words else None
            if 'F' in words: feedrate = words['F']

            tx = words.get('X', cur_x if abs_mode else 0.0)
            ty = words.get('Y', cur_y if abs_mode else 0.0)
            tz = words.get('Z', cur_z if abs_mode else 0.0)

            if not abs_mode:
                tx += cur_x
                ty += cur_y
                tz += cur_z

            has_move = ('X' in words or 'Y' in words or 'Z' in words)

            if g_val == 0 and has_move:
                if tz > 0.001:
                    retracts.append(tz)
                cur_x, cur_y, cur_z = tx, ty, tz
                if cur_contour and len(cur_contour['segs']) > 0:
                    contours.append(cur_contour)
                cur_contour = None

            elif (g_val == 1 or (g_val is None and cur_contour)) and has_move:
                dist = math.hypot(tx - cur_x, ty - cur_y)
                z_step_down = (tz < cur_z - 0.005) and (dist < 0.1)

                if z_step_down and cur_contour and len(cur_contour['segs']) > 2:
                    contours.append(cur_contour)
                    cur_contour = None

                is_plunge = (tz < cur_z - 0.001) or (dist <= 0.001 and tz <= 0.001)
                if is_plunge:
                    plunges.append(tz)
                    if 'F' in words:
                        plunge_feeds.append(words['F'])

                if dist > 0.001:
                    if 'F' in words:
                        cut_feeds.append(words['F'])
                    ang = math.atan2(ty - cur_y, tx - cur_x)
                    if not cur_contour:
                        cur_contour = {
                            'segs': [],
                            'z_depth': tz,
                            'plunge_feed': words.get('F') if is_plunge else (plunge_feeds[-1] if plunge_feeds else None)
                        }
                    elif is_plunge and 'F' in words:
                        cur_contour['plunge_feed'] = words['F']

                    cur_contour['segs'].append({
                        'x1': cur_x, 'y1': cur_y,
                        'x2': tx, 'y2': ty,
                        'z1': cur_z, 'z2': tz,
                        'length': dist,
                        'angle': ang,
                        'feed': feedrate,
                        'plunge_feed': cur_contour.get('plunge_feed')
                    })
                cur_x, cur_y, cur_z = tx, ty, tz

        if cur_contour and len(cur_contour['segs']) > 0:
            contours.append(cur_contour)

        # Stitch across bridge/tab gaps
        contours = self.stitch_contiguous_contours(contours, unit_str)

        # Deduplicate multi-pass / stepdown identical passes
        if self.deduplicate_multi_pass:
            contours = self.deduplicate_2d_contours(contours, unit_str)

        # Clean rotary plunge ramps from all contours
        for c in contours:
            c['segs'] = self.filter_pendulum_ramps(c.get('segs', []), unit_str)

        pos_retracts = [r for r in retracts if r > 0.001]
        if pos_retracts:
            operational = [r for r in pos_retracts if (r <= 0.50 if unit_str == 'G20' else r <= 12.0)]
            target_pool = operational if operational else pos_retracts
            modal_r = max(set(target_pool), key=target_pool.count)
            detected_retract = (0.2000 if modal_r > 0.50 else modal_r) if unit_str == 'G20' else (5.0000 if modal_r > 12.0 else modal_r)
        else:
            detected_retract = 0.2000 if unit_str == 'G20' else 5.0000
        safe_retract = self.retract_height if self.retract_height is not None else detected_retract

        # Generate compensated drag-knife code
        out = []
        out.append(f"; Drag-Knife Offset Post-Processed Code")
        out.append(f"; Blade Offset: {self.blade_offset:.4f}")
        out.append(f"; Safe Travel Clearance (Z): +{safe_retract:.4f}")
        out.append(unit_str)
        out.append("G90")
        out.append("G17")
        out.append(f"G0 Z{safe_retract:.4f} ; Initial safe travel clearance")
        out.append("")

        swivel_count = 0

        for c_idx, contour in enumerate(contours):
            segs = contour['segs']
            if not segs: continue

            out.append(f"; --- Path #{c_idx + 1} ---")
            first = segs[0]
            last = segs[-1]
            is_closed = contour.get('is_closed') or self.is_contour_closed(contour, unit_str)

            if self.cut_depth is not None:
                cut_depth = self.cut_depth
            elif first.get('z2') is not None and abs(first['z2']) > 0.001:
                cut_depth = first['z2']
            elif contour.get('z_depth') is not None and abs(contour['z_depth']) > 0.001:
                cut_depth = contour['z_depth']
            else:
                cut_depth = -0.0551 if unit_str == 'G20' else -1.4000
            entry_angle = first['angle']

            start_tip_x, start_tip_y = first['x1'], first['y1']
            start_spindle_x = start_tip_x + self.blade_offset * math.cos(entry_angle)
            start_spindle_y = start_tip_y + self.blade_offset * math.sin(entry_angle)

            cut_feed = self.cut_feed if self.override_cut_feed else (first.get('feed') or 1000.0)
            plunge_feed = self.plunge_feed if self.override_cut_feed else (contour.get('plunge_feed') or (plunge_feeds[0] if plunge_feeds else 500.0))
            slow_feed = self.corner_slowdown_feed
            slow_dist = self.corner_slowdown_dist

            has_swivel_at = [False] * len(segs)
            for s_i in range(len(segs)):
                n_seg = segs[s_i + 1] if s_i + 1 < len(segs) else (segs[0] if is_closed else None)
                if n_seg:
                    d_ang = self.normalize_angle(n_seg['angle'] - segs[s_i]['angle'])
                    if abs(d_ang) >= self.min_swivel_rad:
                        has_swivel_at[s_i] = True

            if not self.enable_lead_in or self.lead_in_style == 'direct':
                out.append(f"G0 X{start_spindle_x:.4f} Y{start_spindle_y:.4f}")
                out.append(f"G1 Z{cut_depth:.4f} F{plunge_feed:.0f}")
            elif (self.lead_in_style == 'scrap_arc' or self.lead_in_style is None) and is_closed:
                area2 = sum(s['x1'] * s['y2'] - s['x2'] * s['y1'] for s in segs)
                is_ccw = area2 >= 0
                nx = math.sin(entry_angle) if is_ccw else -math.sin(entry_angle)
                ny = -math.cos(entry_angle) if is_ccw else math.cos(entry_angle)
                R = self.lead_in_radius or max(1.8 * self.blade_offset, 0.15 if unit_str == 'G20' else 3.8)

                cx = start_tip_x + R * nx
                cy = start_tip_y + R * ny
                start_lead_tip_x = cx - R * math.cos(entry_angle)
                start_lead_tip_y = cy - R * math.sin(entry_angle)
                lead_heading_ang = entry_angle + math.pi / 2 if is_ccw else entry_angle - math.pi / 2
                start_lead_spindle_x = start_lead_tip_x + self.blade_offset * math.cos(lead_heading_ang)
                start_lead_spindle_y = start_lead_tip_y + self.blade_offset * math.sin(lead_heading_ang)
                I = cx - start_lead_spindle_x
                J = cy - start_lead_spindle_y
                is_cw = is_ccw
                arc_cmd = "G2" if is_cw else "G3"
                lead_feed = slow_feed if (self.override_cut_feed and self.enable_corner_slowdown) else cut_feed

                out.append(f"; Smooth Scrap Arc Lead-In: plunge outside shape in waste material & curve into perimeter")
                out.append(f"G0 X{start_lead_spindle_x:.4f} Y{start_lead_spindle_y:.4f}")
                out.append(f"G1 Z{cut_depth:.4f} F{plunge_feed:.0f}")
                out.append(f"{arc_cmd} X{start_spindle_x:.4f} Y{start_spindle_y:.4f} I{I:.4f} J{J:.4f} F{lead_feed:.0f}")
            else:
                min_runway = 0.35 if unit_str == 'G20' else 9.0
                lead_dist = max(self.blade_offset * (self.lead_in_mult or 4.0), min_runway)
                lead_start_tip_x = start_tip_x - lead_dist * math.cos(entry_angle)
                lead_start_tip_y = start_tip_y - lead_dist * math.sin(entry_angle)
                lead_spindle_x = lead_start_tip_x + self.blade_offset * math.cos(entry_angle)
                lead_spindle_y = lead_start_tip_y + self.blade_offset * math.sin(entry_angle)

                lead_feed = slow_feed if (self.override_cut_feed and self.enable_corner_slowdown) else cut_feed
                out.append(f"G0 X{lead_spindle_x:.4f} Y{lead_spindle_y:.4f}")
                out.append(f"G1 Z{cut_depth:.4f} F{plunge_feed:.0f}")
                out.append(f"G1 X{start_spindle_x:.4f} Y{start_spindle_y:.4f} F{lead_feed:.0f}")

            cur_spindle_x, cur_spindle_y = start_spindle_x, start_spindle_y

            for s_idx, seg in enumerate(segs):
                next_seg = segs[s_idx + 1] if s_idx + 1 < len(segs) else (segs[0] if is_closed else None)
                end_tip_x, end_tip_y = seg['x2'], seg['y2']
                seg_ang = seg['angle']

                next_spindle_x = end_tip_x + self.blade_offset * math.cos(seg_ang)
                next_spindle_y = end_tip_y + self.blade_offset * math.sin(seg_ang)
                dist_moved = math.hypot(next_spindle_x - cur_spindle_x, next_spindle_y - cur_spindle_y)

                if dist_moved > 0.0005:
                    base_feed = cut_feed if self.override_cut_feed else seg.get('feed', 1000.0)
                    prev_had_swivel = (s_idx > 0 and has_swivel_at[s_idx - 1]) or (s_idx == 0 and is_closed and has_swivel_at[-1])
                    next_will_swivel = has_swivel_at[s_idx]

                    if self.enable_corner_slowdown and (prev_had_swivel or next_will_swivel):
                        if dist_moved <= slow_dist * 1.5:
                            out.append(f"G1 X{next_spindle_x:.4f} Y{next_spindle_y:.4f} F{slow_feed:.0f} ; Corner proximity slowdown")
                        elif prev_had_swivel and not next_will_swivel:
                            t_exit = slow_dist / dist_moved
                            exit_x = cur_spindle_x + t_exit * (next_spindle_x - cur_spindle_x)
                            exit_y = cur_spindle_y + t_exit * (next_spindle_y - cur_spindle_y)
                            out.append(f"G1 X{exit_x:.4f} Y{exit_y:.4f} F{slow_feed:.0f} ; Swivel exit ramp")
                            out.append(f"G1 X{next_spindle_x:.4f} Y{next_spindle_y:.4f} F{base_feed:.0f}")
                        elif not prev_had_swivel and next_will_swivel:
                            t_entry = (dist_moved - slow_dist) / dist_moved
                            entry_x = cur_spindle_x + t_entry * (next_spindle_x - cur_spindle_x)
                            entry_y = cur_spindle_y + t_entry * (next_spindle_y - cur_spindle_y)
                            out.append(f"G1 X{entry_x:.4f} Y{entry_y:.4f} F{base_feed:.0f}")
                            out.append(f"G1 X{next_spindle_x:.4f} Y{next_spindle_y:.4f} F{slow_feed:.0f} ; Corner entry slowdown")
                        else:
                            if dist_moved > slow_dist * 2.0:
                                t1 = slow_dist / dist_moved
                                t2 = (dist_moved - slow_dist) / dist_moved
                                exit_x = cur_spindle_x + t1 * (next_spindle_x - cur_spindle_x)
                                exit_y = cur_spindle_y + t1 * (next_spindle_y - cur_spindle_y)
                                entry_x = cur_spindle_x + t2 * (next_spindle_x - cur_spindle_x)
                                entry_y = cur_spindle_y + t2 * (next_spindle_y - cur_spindle_y)
                                out.append(f"G1 X{exit_x:.4f} Y{exit_y:.4f} F{slow_feed:.0f} ; Swivel exit ramp")
                                out.append(f"G1 X{entry_x:.4f} Y{entry_y:.4f} F{base_feed:.0f}")
                                out.append(f"G1 X{next_spindle_x:.4f} Y{next_spindle_y:.4f} F{slow_feed:.0f} ; Corner entry slowdown")
                            else:
                                out.append(f"G1 X{next_spindle_x:.4f} Y{next_spindle_y:.4f} F{slow_feed:.0f} ; Corner proximity slowdown")
                    else:
                        out.append(f"G1 X{next_spindle_x:.4f} Y{next_spindle_y:.4f} F{base_feed:.0f}")

                cur_spindle_x, cur_spindle_y = next_spindle_x, next_spindle_y

                if next_seg:
                    next_ang = next_seg['angle']
                    delta = self.normalize_angle(next_ang - seg_ang)

                    if abs(delta) >= self.min_swivel_rad:
                        swivel_count += 1
                        swivel_end_x = end_tip_x + self.blade_offset * math.cos(next_ang)
                        swivel_end_y = end_tip_y + self.blade_offset * math.sin(next_ang)
                        is_cw = (delta < 0)

                        if self.enable_z_lift:
                            out.append(f"G1 Z{cut_depth + self.z_lift_height:.4f} F600")

                        I = end_tip_x - cur_spindle_x
                        J = end_tip_y - cur_spindle_y
                        g_arc = "G2" if is_cw else "G3"
                        out.append(f"{g_arc} X{swivel_end_x:.4f} Y{swivel_end_y:.4f} I{I:.4f} J{J:.4f} F{self.swivel_feed:.0f}")

                        if self.enable_z_lift:
                            out.append(f"G1 Z{cut_depth:.4f} F600")

                        cur_spindle_x, cur_spindle_y = swivel_end_x, swivel_end_y

            if self.enable_overcut:
                last_ang = segs[-1]['angle']
                overcut_dist = self.blade_offset * 1.1
                over_x = cur_spindle_x + overcut_dist * math.cos(last_ang)
                over_y = cur_spindle_y + overcut_dist * math.sin(last_ang)
                over_feed = slow_feed if (self.override_cut_feed and self.enable_corner_slowdown) else cut_feed
                out.append(f"G1 X{over_x:.4f} Y{over_y:.4f} F{over_feed:.0f}")

            out.append(f"G0 Z{safe_retract:.4f} ; Safe clearance retract")
            out.append("")

        out.append("M30")

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(out))

        u_abbr = 'in' if unit_str == 'G20' else 'mm'
        f_abbr = 'IPM' if unit_str == 'G20' else 'mm/min'
        sample_cut = (contours[0]['segs'][0].get('z2') if contours and contours[0].get('segs') else None) or (self.cut_depth if self.cut_depth is not None else (-0.0551 if unit_str == 'G20' else -1.4000))
        sample_plunge = self.plunge_feed if self.override_cut_feed else (plunge_feeds[0] if plunge_feeds else 500.0)
        sample_feed = self.cut_feed if self.override_cut_feed else (cut_feeds[0] if cut_feeds else 1150.0)

        print(f"\n===========================================================")
        print(f"  Dragged /// Ritual Skis • Toolpath Analysis & Summary    ")
        print(f"===========================================================")
        print(f"  • Safe Travel Clearance (Z): +{safe_retract:.4f} {u_abbr}")
        print(f"  • Plunge Cutting Depth (Z):  {sample_cut:.4f} {u_abbr}")
        print(f"  • Plunge Feedrate (F):       {sample_plunge:.1f} {f_abbr}")
        print(f"  • Cruising Cut Feedrate (F): {sample_feed:.1f} {f_abbr}")
        print(f"  • Contours / Cutouts:        {len(contours)}")
        print(f"  • Injected Corner Swivels:   {swivel_count}")
        print(f"  • Output Saved To:           {output_path}")
        print(f"===========================================================\n")

def main():
    parser = argparse.ArgumentParser(description="Drag Knife G-Code Post-Processor CLI")
    parser.add_argument("input", help="Input raw CAM G-code file")
    parser.add_argument("-o", "--output", default="dragknife_output.gcode", help="Output modified G-code path")
    parser.add_argument("--skibase", action="store_true", help="Use Ritual Ski Base (UHMWPE/P-Tex) parameters (offset=1.80mm, min-angle=12 deg, swivel-feed=400, cut-feed=1150, z-lift=0.8mm, corner-slowdown=True)")
    parser.add_argument("--sst", action="store_true", help="Use SST Drag Knife preset parameters (offset=1.80mm, min-angle=12 deg, swivel-feed=650)")
    parser.add_argument("-e", "--offset", type=float, default=1.80, help="Blade offset e in mm or inches (default: 1.80mm / 0.071in)")
    parser.add_argument("-a", "--min-angle", type=float, default=12.0, help="Minimum corner turn angle (deg) to trigger swivel arc (default: 12)")
    parser.add_argument("-z", "--cut-depth", type=float, default=None, help="Target plunge cutting depth Z in mm or inches (default: -1.40mm / -0.055in)")
    parser.add_argument("-r", "--retract", type=float, default=None, help="Safe retract clearance Z (default: 0.20in or 5.0mm)")
    parser.add_argument("--lead-in-style", choices=["straight", "scrap_arc", "direct"], default="straight", help="Lead-in geometry strategy (default: straight)")
    parser.add_argument("--lead-in-radius", type=float, default=None, help="Lead-in arc radius in scrap waste")
    parser.add_argument("--no-lead-in", action="store_true", help="Disable auto straight lead-in entry")
    parser.add_argument("--no-overcut", action="store_true", help="Disable closed loop overcut finish")
    parser.add_argument("--no-deduplicate", action="store_true", help="Disable deduplicating multi-pass stepdown contours")
    parser.add_argument("--z-lift", action="store_true", help="Enable Z lift during tight swivel corner actions")
    parser.add_argument("--z-lift-height", type=float, default=0.8, help="Z swivel height delta (default: 0.8)")
    parser.add_argument("--swivel-feed", type=float, default=400.0, help="Feedrate during corner swivel arc (default: 400)")
    parser.add_argument("--override-cut-feed", action="store_true", help="Override all linear cutting feedrates")
    parser.add_argument("--cut-feed", type=float, default=1150.0, help="Cruising cutting feedrate (default: 1150 mm/min or 45 IPM)")
    parser.add_argument("--plunge-feed", type=float, default=500.0, help="Plunge entry feedrate (default: 500 mm/min or 20 IPM)")
    parser.add_argument("--corner-slowdown", action="store_true", help="Enable corner approach & exit deceleration")
    parser.add_argument("--slowdown-feed", type=float, default=500.0, help="Corner approach slowdown feedrate (default: 500 mm/min or 20 IPM)")
    parser.add_argument("--slowdown-dist", type=float, default=5.0, help="Corner slowdown distance (default: 5.0mm or 0.20in)")

    args = parser.parse_args()
    if args.skibase:
        offset = 1.80
        min_angle = 12.0
        swivel_feed = 400.0
        z_lift = True
        z_lift_height = 0.8
        override_cut = True
        cut_feed = 1150.0
        plunge_feed = 500.0
        corner_slowdown = True
        slow_feed = 500.0
        slow_dist = 5.0
        retract = args.retract
    elif args.sst:
        offset = 1.80
        min_angle = 12.0
        swivel_feed = 650.0
        z_lift = args.z_lift
        z_lift_height = args.z_lift_height
        override_cut = args.override_cut_feed
        cut_feed = args.cut_feed
        plunge_feed = args.plunge_feed
        corner_slowdown = args.corner_slowdown
        slow_feed = args.slowdown_feed
        slow_dist = args.slowdown_dist
        retract = args.retract
    else:
        offset = args.offset
        min_angle = args.min_angle
        swivel_feed = args.swivel_feed
        z_lift = args.z_lift
        z_lift_height = args.z_lift_height
        override_cut = args.override_cut_feed
        cut_feed = args.cut_feed
        plunge_feed = args.plunge_feed
        corner_slowdown = args.corner_slowdown
        slow_feed = args.slowdown_feed
        slow_dist = args.slowdown_dist
        retract = args.retract

    proc = DragKnifeCLIProcessor(
        blade_offset=offset,
        min_angle_deg=min_angle,
        enable_lead_in=not args.no_lead_in,
        lead_in_style=args.lead_in_style,
        lead_in_radius=args.lead_in_radius,
        enable_overcut=not args.no_overcut,
        deduplicate_multi_pass=not args.no_deduplicate,
        enable_z_lift=z_lift,
        z_lift_height=z_lift_height,
        swivel_feed=swivel_feed,
        override_cut_feed=override_cut,
        cut_feed=cut_feed,
        plunge_feed=plunge_feed,
        enable_corner_slowdown=corner_slowdown,
        corner_slowdown_feed=slow_feed,
        corner_slowdown_dist=slow_dist,
        retract_height=retract,
        cut_depth=args.cut_depth
    )
    proc.process_file(args.input, args.output)

if __name__ == "__main__":
    main()
