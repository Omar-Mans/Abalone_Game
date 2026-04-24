import math
import time

DIRECTIONS = [
    (1, 0),    # 0 E
    (1, -1),   # 1 NE
    (0, -1),   # 2 NW
    (-1, 0),   # 3 W
    (-1, 1),   # 4 SW
    (0, 1),    # 5 SE
]

BOARD_CELLS = [
    (q, r)
    for q in range(-4, 5)
    for r in range(-4, 5)
    if -4 <= -q - r <= 4
]

BOARD_SET = {f"{q},{r}" for q, r in BOARD_CELLS}


def key(c):
    return f"{c[0]},{c[1]}"


def parse_key(k):
    q, r = k.split(",")
    return int(q), int(r)


def inside(c):
    return key(c) in BOARD_SET


def add(a, b):
    return a[0] + b[0], a[1] + b[1]


def opponent(player):
    return "WHITE" if player == "BLACK" else "BLACK"


def get_cell(board, c):
    return board.get(key(c), "EMPTY")


def is_adjacent(a, b):
    return any(add(a, d) == b for d in DIRECTIONS)


def line_orientation(selection):
    if len(selection) <= 1:
        return None

    selected = set(selection)

    for i, d in enumerate(DIRECTIONS):
        sorted_cells = sorted(selection, key=lambda c: c[0] * d[0] + c[1] * d[1])
        ok = True
        for j in range(len(sorted_cells) - 1):
            if add(sorted_cells[j], d) != sorted_cells[j + 1]:
                ok = False
                break
        if ok:
            return i

    return None


def valid_selection(board, selection, player):
    if not 1 <= len(selection) <= 3:
        return False

    if len(set(selection)) != len(selection):
        return False

    for c in selection:
        if get_cell(board, c) != player:
            return False

    if len(selection) == 1:
        return True

    return line_orientation(selection) is not None


def legal_broadside(board, selection, direction):
    for c in selection:
        dest = add(c, direction)
        if not inside(dest):
            return False
        if get_cell(board, dest) != "EMPTY":
            return False
    return True


def legal_inline(board, selection, direction_index, player):
    direction = DIRECTIONS[direction_index]

    if len(selection) == 1:
        dest = add(selection[0], direction)
        return inside(dest) and get_cell(board, dest) == "EMPTY"

    orient = line_orientation(selection)
    if orient is None:
        return False

    if direction_index not in (orient, (orient + 3) % 6):
        return False

    selected_sorted = sorted(
        selection,
        key=lambda c: c[0] * direction[0] + c[1] * direction[1],
        reverse=True
    )

    front = selected_sorted[0]
    next_pos = add(front, direction)

    if not inside(next_pos):
        return False

    occ = get_cell(board, next_pos)

    if occ == "EMPTY":
        return True

    if occ == player:
        return False

    opp = opponent(player)
    opp_count = 0
    probe = next_pos

    while inside(probe) and get_cell(board, probe) == opp:
        opp_count += 1
        probe = add(probe, direction)

    if opp_count >= len(selection):
        return False

    if inside(probe) and get_cell(board, probe) != "EMPTY":
        return False

    return True


def allowed_dirs(board, selection, player):
    if not valid_selection(board, selection, player):
        return []

    result = []
    orient = line_orientation(selection)

    for i, direction in enumerate(DIRECTIONS):
        if len(selection) == 1:
            if legal_broadside(board, selection, direction):
                result.append(i)
            continue

        inline = orient is not None and i in (orient, (orient + 3) % 6)

        if inline:
            if legal_inline(board, selection, i, player):
                result.append(i)
        else:
            if legal_broadside(board, selection, direction):
                result.append(i)

    return result


def apply_move(board, selection, direction_index, player):
    direction = DIRECTIONS[direction_index]
    new_board = dict(board)
    ejected = {"BLACK": 0, "WHITE": 0}

    if len(selection) == 1:
        c = selection[0]
        dest = add(c, direction)
        new_board.pop(key(c), None)
        if inside(dest):
            new_board[key(dest)] = player
        return new_board, ejected

    orient = line_orientation(selection)
    inline = orient is not None and direction_index in (orient, (orient + 3) % 6)

    if not inline:
        for c in selection:
            new_board.pop(key(c), None)
        for c in selection:
            new_board[key(add(c, direction))] = player
        return new_board, ejected

    selected_sorted = sorted(
        selection,
        key=lambda c: c[0] * direction[0] + c[1] * direction[1],
        reverse=True
    )

    opp = opponent(player)
    front = selected_sorted[0]
    probe = add(front, direction)
    opp_positions = []

    while inside(probe) and get_cell(new_board, probe) == opp:
        opp_positions.append(probe)
        probe = add(probe, direction)

    opp_positions = sorted(
        opp_positions,
        key=lambda c: c[0] * direction[0] + c[1] * direction[1],
        reverse=True
    )

    for c in opp_positions:
        marble = new_board.pop(key(c), None)
        dest = add(c, direction)
        if marble:
            if inside(dest):
                new_board[key(dest)] = marble
            else:
                ejected[marble] += 1

    for c in selected_sorted:
        marble = new_board.pop(key(c), None)
        dest = add(c, direction)
        if marble:
            if inside(dest):
                new_board[key(dest)] = marble
            else:
                ejected[marble] += 1

    return new_board, ejected


def generate_selections(board, player):
    coords = [parse_key(k) for k, v in board.items() if v == player]
    coord_set = set(coords)
    selections = []
    seen = set()

    def add_selection(sel):
        frozen = tuple(sorted(sel))
        if frozen not in seen and valid_selection(board, list(frozen), player):
            seen.add(frozen)
            selections.append(list(frozen))

    for c in coords:
        add_selection([c])

    for c in coords:
        for d in DIRECTIONS:
            c2 = add(c, d)
            if c2 in coord_set:
                add_selection([c, c2])

    for c in coords:
        for d in DIRECTIONS:
            c2 = add(c, d)
            c3 = add(c2, d)
            if c2 in coord_set and c3 in coord_set:
                add_selection([c, c2, c3])

    return selections


def generate_moves(board, player):
    moves = []
    for sel in generate_selections(board, player):
        for d in allowed_dirs(board, sel, player):
            moves.append((sel, d))
    return moves


def count_player(board, player):
    return sum(1 for v in board.values() if v == player)


def center_score(board, player):
    total = 0
    for k, v in board.items():
        if v == player:
            q, r = parse_key(k)
            s = -q - r
            total -= max(abs(q), abs(r), abs(s))
    return total


def edge_penalty(board, player):
    penalty = 0
    for k, v in board.items():
        if v == player:
            q, r = parse_key(k)
            s = -q - r
            if max(abs(q), abs(r), abs(s)) == 4:
                penalty += 1
    return penalty


def evaluate(board, player):
    opp = opponent(player)

    player_count = count_player(board, player)
    opp_count = count_player(board, opp)

    player_lost = 14 - player_count
    opp_lost = 14 - opp_count

    if opp_lost >= 6:
        return 100000
    if player_lost >= 6:
        return -100000

    score = 0
    score += (opp_lost - player_lost) * 1200
    score += (player_count - opp_count) * 100
    score += center_score(board, player) * 8
    score -= center_score(board, opp) * 8
    score -= edge_penalty(board, player) * 18
    score += edge_penalty(board, opp) * 18

    return score


def move_priority(board, move, player):
    sel, d = move
    new_board, ejected = apply_move(board, sel, d, player)
    opp = opponent(player)

    priority = evaluate(new_board, player)
    priority += ejected[opp] * 5000
    priority -= ejected[player] * 5000
    priority += len(sel) * 5

    return priority


def alphabeta(board, current_player, root_player, depth, alpha, beta, deadline):
    if time.time() > deadline or depth == 0:
        return evaluate(board, root_player)

    black_count = count_player(board, "BLACK")
    white_count = count_player(board, "WHITE")

    if black_count <= 8 or white_count <= 8:
        return evaluate(board, root_player)

    moves = generate_moves(board, current_player)

    if not moves:
        return evaluate(board, root_player)

    moves.sort(key=lambda m: move_priority(board, m, current_player), reverse=True)

    next_player = opponent(current_player)

    if current_player == root_player:
        value = -math.inf

        for move in moves:
            new_board, _ = apply_move(board, move[0], move[1], current_player)
            value = max(
                value,
                alphabeta(new_board, next_player, root_player, depth - 1, alpha, beta, deadline)
            )
            alpha = max(alpha, value)

            if alpha >= beta:
                break

        return value

    else:
        value = math.inf

        for move in moves:
            new_board, _ = apply_move(board, move[0], move[1], current_player)
            value = min(
                value,
                alphabeta(new_board, next_player, root_player, depth - 1, alpha, beta, deadline)
            )
            beta = min(beta, value)

            if alpha >= beta:
                break

        return value


def get_best_move(board, player, depth=1):
    moves = generate_moves(board, player)

    if not moves:
        return [], 0

    deadline = time.time() + 1.2

    moves.sort(key=lambda m: move_priority(board, m, player), reverse=True)

    best_score = -math.inf
    best_move = moves[0]

    for move in moves:
        if time.time() > deadline:
            break

        new_board, _ = apply_move(board, move[0], move[1], player)

        score = alphabeta(
            new_board,
            opponent(player),
            player,
            max(0, depth - 1),
            -math.inf,
            math.inf,
            deadline
        )

        if score > best_score:
            best_score = score
            best_move = move

    selection_keys = [key(c) for c in best_move[0]]
    return selection_keys, best_move[1]