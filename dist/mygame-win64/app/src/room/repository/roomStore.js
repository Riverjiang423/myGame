function createRoomStore(initialRooms) {
  const rooms = initialRooms instanceof Map ? initialRooms : new Map();
  let defaultRoomId = null;

  function getRoom(roomId) {
    return rooms.get(roomId);
  }

  function setRoom(roomId, room) {
    rooms.set(roomId, room);
    return room;
  }

  function hasRoom(roomId) {
    return rooms.has(roomId);
  }

  function deleteRoom(roomId) {
    const deleted = rooms.delete(roomId);
    if (deleted && defaultRoomId === roomId) {
      defaultRoomId = null;
    }
    return deleted;
  }

  function getAllRooms() {
    return Array.from(rooms.values());
  }

  function getRoomMap() {
    return rooms;
  }

  function getDefaultRoomId() {
    if (defaultRoomId && rooms.has(defaultRoomId)) {
      return defaultRoomId;
    }
    if (defaultRoomId && !rooms.has(defaultRoomId)) {
      defaultRoomId = null;
    }
    return defaultRoomId;
  }

  function getOrCreateDefaultRoom(createRoom) {
    const currentDefaultRoomId = getDefaultRoomId();
    if (currentDefaultRoomId) {
      return {
        room: rooms.get(currentDefaultRoomId),
        created: false
      };
    }

    if (typeof createRoom !== 'function') {
      throw new Error('createRoom must be a function');
    }

    const room = createRoom();
    if (!room || !room.id) {
      throw new Error('createRoom must return a room with id');
    }

    rooms.set(room.id, room);
    defaultRoomId = room.id;

    return {
      room,
      created: true
    };
  }

  return {
    getRoom,
    setRoom,
    hasRoom,
    deleteRoom,
    getAllRooms,
    getRoomMap,
    getDefaultRoomId,
    getOrCreateDefaultRoom
  };
}

module.exports = {
  createRoomStore
};
