"use strict";
/*
 * This file is part of IodineGBA
 *
 * Copyright (C) 2012-2013 Grant Galitz
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * version 2 as published by the Free Software Foundation.
 * The full license is available at http://www.gnu.org/licenses/gpl.html
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 */
function GameBoyAdvanceWait(IOCore) {
	this.IOCore = IOCore;
    this.memory = this.IOCore.memory;
	this.initialize();
}
GameBoyAdvanceWait.prototype.GAMEPAKWaitStateTable = [
	5, 4, 3, 9
];
GameBoyAdvanceWait.prototype.initialize = function () {
	this.WRAMConfiguration = 0xD000020;     //WRAM configuration control register current data.
	this.WRAMWaitState = 3;					//External WRAM wait state.
	this.SRAMWaitState = 5;
	this.CARTWaitState0First = 5;
	this.CARTWaitState0Second = 3;
	this.CARTWaitState1First = 5;
	this.CARTWaitState1Second = 5;
	this.CARTWaitState2First = 5;
	this.CARTWaitState2Second = 9;
	this.POSTBOOT = 0;
	this.nonSequential = true;
	this.ROMPrebuffer = 0;
	this.prefetchEnabled = true;
	this.WAITCNT0 = 0;
	this.WAITCNT1 = 0;
    this.getROMRead16 = this.getROMRead16Prefetch;
    this.getROMRead32 = this.getROMRead32Prefetch;
    this.opcodeCache = new GameBoyAdvanceMemoryCache(this.memory);
}
GameBoyAdvanceWait.prototype.writeWAITCNT0 = function (data) {
	this.SRAMWaitState = this.GAMEPAKWaitStateTable[data & 0x3] | 0;
	this.CARTWaitState0First = this.GAMEPAKWaitStateTable[(data >> 2) & 0x3] | 0;
	this.CARTWaitState0Second = ((data & 0x10) == 0x10) ? 0x2 : 0x3;
	this.CARTWaitState1First = this.GAMEPAKWaitStateTable[(data >> 5) & 0x3] | 0;
	this.CARTWaitState1Second = (data > 0x7F) ? 0x2 : 0x5;
	this.WAITCNT0 = data | 0;
    //this.IOCore.cpu.dynarec.invalidateCaches();
}
GameBoyAdvanceWait.prototype.readWAITCNT0 = function () {
	return this.WAITCNT0 | 0;
}
GameBoyAdvanceWait.prototype.writeWAITCNT1 = function (data) {
	this.CARTWaitState2First = this.GAMEPAKWaitStateTable[data & 0x3] | 0;
	this.CARTWaitState2Second = ((data & 0x8) == 0x8) ? 0x2 : 0x9;
	this.prefetchEnabled = ((data & 0x40) == 0x40);
	if (!this.prefetchEnabled) {
		this.ROMPrebuffer = 0;
        this.getROMRead16 = this.getROMRead16NoPrefetch;
        this.getROMRead32 = this.getROMRead32NoPrefetch;
	}
    else {
        this.getROMRead16 = this.getROMRead16Prefetch;
        this.getROMRead32 = this.getROMRead32Prefetch;
    }
	this.WAITCNT1 = data | 0;
    //this.IOCore.cpu.dynarec.invalidateCaches();
}
GameBoyAdvanceWait.prototype.readWAITCNT1 = function () {
	return this.WAITCNT1 | 0x20;
}
GameBoyAdvanceWait.prototype.writePOSTBOOT = function (data) {
	this.POSTBOOT = data | 0;
}
GameBoyAdvanceWait.prototype.readPOSTBOOT = function () {
	return this.POSTBOOT | 0;
}
GameBoyAdvanceWait.prototype.writeHALTCNT = function (data) {
	//HALT/STOP mode entrance:
    this.IOCore.flagStepper((data < 0x80) ? 2 : 4);
}
GameBoyAdvanceWait.prototype.writeConfigureWRAM8 = function (address, data) {
	address = address | 0;
    data = data | 0;
    switch (address & 0x3) {
		case 0:
            this.memory.remapWRAM(data & 0x21);
            this.WRAMConfiguration = (this.WRAMConfiguration & 0xFFFFFF00) | data;
            break;
        case 1:
            this.WRAMConfiguration = (this.WRAMConfiguration & 0xFFFF00FF) | (data << 8);
            break;
        case 2:
            this.WRAMConfiguration = (this.WRAMConfiguration & 0xFF00FFFF) | (data << 16);
            break;
        case 3:
			this.WRAMWaitState = (0x10 - (data & 0xF)) | 0;
            this.WRAMConfiguration = (this.WRAMConfiguration & 0xFFFFFF) | (data << 24);
	}
}
GameBoyAdvanceWait.prototype.writeConfigureWRAM16 = function (address, data) {
	address = address | 0;
    data = data | 0;
    if ((address & 0x2) == 0) {
        this.WRAMConfiguration = (this.WRAMConfiguration & 0xFFFF0000) | (data & 0xFFFF);
        this.memory.remapWRAM(data & 0x21);
    }
    else {
        this.WRAMConfiguration = (data << 16) | (this.WRAMConfiguration & 0xFFFF);
        this.WRAMWaitState = (0x10 - ((data >> 8) & 0xF)) | 0;
    }
}
GameBoyAdvanceWait.prototype.writeConfigureWRAM32 = function (data) {
	data = data | 0;
    this.WRAMConfiguration = data | 0;
    this.WRAMWaitState = (0x10 - ((data >> 24) & 0xF)) | 0;
    this.memory.remapWRAM(data & 0x21);
}
GameBoyAdvanceWait.prototype.readConfigureWRAM8 = function (address) {
	address = address | 0;
    var data = 0;
    switch (address & 0x3) {
        case 0:
            data = this.WRAMConfiguration & 0x2F;
            break;
        case 3:
            data = (this.WRAMConfiguration >> 24) & 0xFF;
    }
    return data | 0;
}
GameBoyAdvanceWait.prototype.readConfigureWRAM16 = function (address) {
	address = address | 0;
    var data = 0;
    if ((address & 0x2) == 0) {
        data = this.WRAMConfiguration & 0x2F;
    }
    else {
        data = (this.WRAMConfiguration >> 16) & 0xFF00;
    }
    return data | 0;
}
GameBoyAdvanceWait.prototype.readConfigureWRAM32 = function () {
    return this.WRAMConfiguration & 0xFF00002F;
}
GameBoyAdvanceWait.prototype.CPUInternalCyclePrefetch = function (clocks) {
    clocks = clocks | 0;
    //Clock for idle CPU time:
	this.IOCore.updateCore(clocks | 0);
	//Check for ROM prefetching:
	if (this.prefetchEnabled) {
		var address = this.IOCore.cpu.registers[15] | 0;
        //We were already in ROM, so if prefetch do so as sequential:
		//Only case for non-sequential ROM prefetch is invalid anyways:
		switch ((address >> 24) & 0xFF) {
			case 0x8:
			case 0x9:
				while ((clocks | 0) >= (this.CARTWaitState0Second | 0)) {
                    clocks = ((clocks | 0) - (this.CARTWaitState0Second | 0)) | 0;
					this.ROMPrebuffer = ((this.ROMPrebuffer | 0) + 1) | 0;
				}
				break;
			case 0xA:
			case 0xB:
				while ((clocks | 0) >= (this.CARTWaitState1Second | 0)) {
                    clocks = ((clocks | 0) - (this.CARTWaitState1Second | 0)) | 0;
					this.ROMPrebuffer = ((this.ROMPrebuffer | 0) + 1) | 0;
				}
				break;
			case 0xC:
			case 0xD:
				while ((clocks | 0) >= (this.CARTWaitState2Second | 0)) {
					clocks = ((clocks | 0) - (this.CARTWaitState2Second | 0)) | 0;
					this.ROMPrebuffer = ((this.ROMPrebuffer | 0) + 1) | 0;
				}
		}
		//ROM buffer caps out at 8 x 16 bit:
		if ((this.ROMPrebuffer | 0) > 8) {
			this.ROMPrebuffer = 8;
		}
	}
}
GameBoyAdvanceWait.prototype.CPUInternalSingleCyclePrefetch = function () {
    //Clock for idle CPU time:
	this.IOCore.updateCoreSingle();
    //Not enough time for prebuffer buffering, so skip it.
}
GameBoyAdvanceWait.prototype.CPUGetOpcode16 = function (address) {
	address = address | 0;
    var data = 0;
    if ((address | 0) >= 0x8000000 && (address | 0) < 0xE000000) {
		data = this.getROMRead16(address | 0) | 0;
	}
    else {
        data = this.opcodeCache.memoryReadFast16(address >>> 0) | 0;
    }
	return data | 0;
}
GameBoyAdvanceWait.prototype.getROMRead16Prefetch = function (address) {
    //Caching enabled:
    address = address | 0;
    var clocks = 0;
    var data = 0;
    if ((this.ROMPrebuffer | 0) == 0) {
        //Cache is empty:
        if ((address | 0) < 0xA000000) {
            clocks = ((this.nonSequential) ? (this.CARTWaitState0First | 0) : (this.CARTWaitState0Second | 0)) | 0;
        }
        else if ((address | 0) < 0xC000000) {
            clocks = ((this.nonSequential) ? (this.CARTWaitState1First | 0) : (this.CARTWaitState1Second | 0)) | 0;
        }
        else {
            clocks = ((this.nonSequential) ? (this.CARTWaitState2First | 0) : (this.CARTWaitState2Second | 0)) | 0;
        }
        this.IOCore.updateCore(clocks | 0);
        this.nonSequential = false;
        data = this.IOCore.cartridge.readROM16(address & 0x1FFFFFF) | 0;
    }
    else {
        //Cache hit:
        this.ROMPrebuffer = ((this.ROMPrebuffer | 0) - 1) | 0;
        this.FASTAccess2();
        data = this.IOCore.cartridge.readROM16(address & 0x1FFFFFF) | 0;
    }
    return data | 0;
}
GameBoyAdvanceWait.prototype.getROMRead16NoPrefetch = function (address) {
    //Caching disabled:
    address = address | 0;
    var clocks = 0;
    if ((address | 0) < 0xA000000) {
        clocks = this.CARTWaitState0First | 0;
    }
    else if ((address | 0) < 0xC000000) {
        clocks = this.CARTWaitState1First | 0;
    }
    else {
        clocks = this.CARTWaitState2First | 0;
    }
    this.IOCore.updateCore(clocks | 0);
    this.nonSequential = false;
    return this.IOCore.cartridge.readROM16(address & 0x1FFFFFF) | 0;
}
GameBoyAdvanceWait.prototype.CPUGetOpcode32 = function (address) {
	address = address | 0;
    var data = 0;
    if ((address | 0) >= 0x8000000 && (address | 0) < 0xE000000) {
		data = this.getROMRead32(address | 0) | 0;
	}
	else {
        data = this.opcodeCache.memoryReadFast32(address >>> 0) | 0;
    }
    return data | 0;
}
GameBoyAdvanceWait.prototype.getROMRead32Prefetch = function (address) {
    //Caching enabled:
    address = address | 0;
    var clocks = 0;
    var data = 0;
    if ((this.ROMPrebuffer | 0) == 0) {
        //Cache hit:
        if ((address | 0) < 0xA000000) {
            clocks = (((this.nonSequential) ? (this.CARTWaitState0First | 0) : (this.CARTWaitState0Second | 0)) + (this.CARTWaitState0Second | 0)) | 0;
        }
        else if ((address | 0) < 0xC000000) {
            clocks = (((this.nonSequential) ? (this.CARTWaitState1First | 0) : (this.CARTWaitState1Second | 0)) + (this.CARTWaitState1Second | 0)) | 0;
        }
        else {
            clocks = (((this.nonSequential) ? (this.CARTWaitState2First | 0) : (this.CARTWaitState2Second | 0)) + (this.CARTWaitState2Second | 0)) | 0;
        }
        this.IOCore.updateCore(clocks | 0);
        this.nonSequential = false;
        data = this.IOCore.cartridge.readROM32(address & 0x1FFFFFF) | 0;
    }
    else {
        if ((this.ROMPrebuffer | 0) > 1) {
            //Cache hit:
           this.ROMPrebuffer = ((this.ROMPrebuffer | 0) - 2) | 0;
            this.FASTAccess2();
            data = this.IOCore.cartridge.readROM32(address & 0x1FFFFFF) | 0;
        }
        else {
            //Cache miss if only 16 bits out of 32 bits stored:
            this.ROMPrebuffer = 0;
            if ((address | 0) < 0xA000000) {
                clocks = (((this.nonSequential) ? (this.CARTWaitState0First | 0) : (this.CARTWaitState0Second | 0)) + (this.CARTWaitState0Second | 0)) | 0;
            }
            else if ((address | 0) < 0xC000000) {
                clocks = (((this.nonSequential) ? (this.CARTWaitState1First | 0) : (this.CARTWaitState1Second | 0)) + (this.CARTWaitState1Second | 0)) | 0;
            }
            else {
                clocks = (((this.nonSequential) ? (this.CARTWaitState2First | 0) : (this.CARTWaitState2Second | 0)) + (this.CARTWaitState2Second | 0)) | 0;
            }
            this.IOCore.updateCore(clocks | 0);
            this.nonSequential = false;
            data = this.IOCore.cartridge.readROM32(address & 0x1FFFFFF) | 0;
        }
    }
    return data | 0;
}
GameBoyAdvanceWait.prototype.getROMRead32NoPrefetch = function (address) {
    //Caching disabled:
    address = address | 0;
    var clocks = 0;
    if ((address | 0) < 0xA000000) {
        clocks = ((this.CARTWaitState0First | 0) + (this.CARTWaitState0Second | 0)) | 0;
    }
    else if ((address | 0) < 0xC000000) {
        clocks = ((this.CARTWaitState1First | 0) + (this.CARTWaitState1Second | 0)) | 0;
    }
    else {
        clocks = ((this.CARTWaitState2First | 0) + (this.CARTWaitState2Second | 0)) | 0;
    }
    this.IOCore.updateCore(clocks | 0);
    this.nonSequential = false;
    return this.IOCore.cartridge.readROM32(address & 0x1FFFFFF) | 0;
}
GameBoyAdvanceWait.prototype.NonSequentialBroadcast = function () {
	this.nonSequential = true;
	this.ROMPrebuffer = 0;
}
GameBoyAdvanceWait.prototype.FASTAccess2 = function () {
	this.IOCore.updateCoreSingle();
	this.nonSequential = false;
}
GameBoyAdvanceWait.prototype.WRAMAccess8 = function () {
    this.IOCore.updateCore(this.WRAMWaitState | 0);
	this.nonSequential = false;
}
GameBoyAdvanceWait.prototype.WRAMAccess16 = function () {
    this.IOCore.updateCore(this.WRAMWaitState | 0);
	this.nonSequential = false;
}
GameBoyAdvanceWait.prototype.WRAMAccess32 = function () {
    this.IOCore.updateCore(this.WRAMWaitState << 1);
	this.nonSequential = false;
}
GameBoyAdvanceWait.prototype.ROM0Access8 = function () {
    if (this.nonSequential) {
        this.IOCore.updateCore(this.CARTWaitState0First | 0);
        this.nonSequential = false;
    }
    else {
        this.IOCore.updateCore(this.CARTWaitState0Second | 0);
    }
}
GameBoyAdvanceWait.prototype.ROM0Access16 = function () {
    if (this.nonSequential) {
        this.IOCore.updateCore(this.CARTWaitState0First | 0);
        this.nonSequential = false;
    }
    else {
        this.IOCore.updateCore(this.CARTWaitState0Second | 0);
    }
}
GameBoyAdvanceWait.prototype.ROM0Access32 = function () {
    if (this.nonSequential) {
        this.IOCore.updateCore(((this.CARTWaitState0First | 0) + (this.CARTWaitState0Second | 0)) | 0);
        this.nonSequential = false;
    }
    else {
        this.IOCore.updateCore(this.CARTWaitState0Second << 1);
    }
}
GameBoyAdvanceWait.prototype.ROM1Access8 = function () {
    if (this.nonSequential) {
        this.IOCore.updateCore(this.CARTWaitState1First | 0);
        this.nonSequential = false;
    }
    else {
        this.IOCore.updateCore(this.CARTWaitState1Second | 0);
    }
}
GameBoyAdvanceWait.prototype.ROM1Access16 = function () {
    if (this.nonSequential) {
        this.IOCore.updateCore(this.CARTWaitState1First | 0);
        this.nonSequential = false;
    }
    else {
        this.IOCore.updateCore(this.CARTWaitState1Second | 0);
    }
}
GameBoyAdvanceWait.prototype.ROM1Access32 = function () {
    if (this.nonSequential) {
        this.IOCore.updateCore(((this.CARTWaitState1First | 0) + (this.CARTWaitState1Second | 0)));
        this.nonSequential = false;
    }
    else {
        this.IOCore.updateCore(this.CARTWaitState1Second << 1);
    }
}
GameBoyAdvanceWait.prototype.ROM2Access8 = function () {
    if (this.nonSequential) {
        this.IOCore.updateCore(this.CARTWaitState2First | 0);
        this.nonSequential = false;
    }
    else {
        this.IOCore.updateCore(this.CARTWaitState2Second | 0);
    }
}
GameBoyAdvanceWait.prototype.ROM2Access16 = function () {
    if (this.nonSequential) {
        this.IOCore.updateCore(this.CARTWaitState2First | 0);
        this.nonSequential = false;
    }
    else {
        this.IOCore.updateCore(this.CARTWaitState2Second | 0);
    }
}
GameBoyAdvanceWait.prototype.ROM2Access32 = function () {
    if (this.nonSequential) {
        this.IOCore.updateCore(((this.CARTWaitState2First | 0) + (this.CARTWaitState2Second | 0)));
        this.nonSequential = false;
    }
    else {
        this.IOCore.updateCore(this.CARTWaitState2Second << 1);
    }
}
GameBoyAdvanceWait.prototype.SRAMAccess = function () {
	this.IOCore.updateCore(this.SRAMWaitState | 0);
	this.nonSequential = false;
}
GameBoyAdvanceWait.prototype.VRAMAccess8 = function () {
    this.IOCore.updateCore((this.IOCore.gfx.isRendering) ? 2 : 1);
	this.nonSequential = false;
}
GameBoyAdvanceWait.prototype.VRAMAccess16 = function () {
    this.IOCore.updateCore((this.IOCore.gfx.isRendering) ? 2 : 1);
	this.nonSequential = false;
}
GameBoyAdvanceWait.prototype.VRAMAccess32 = function () {
    this.IOCore.updateCore((this.IOCore.gfx.isRendering) ? 4 : 2);
	this.nonSequential = false;
}
GameBoyAdvanceWait.prototype.OAMAccess8 = function () {
    this.IOCore.updateCore(((this.IOCore.gfx.OAMLockedCycles() | 0) + 1) | 0);
	this.nonSequential = false;
}
GameBoyAdvanceWait.prototype.OAMAccess16 = function () {
    this.IOCore.updateCore(((this.IOCore.gfx.OAMLockedCycles() | 0) + 1) | 0);
	this.nonSequential = false;
}
GameBoyAdvanceWait.prototype.OAMAccess32 = function () {
    this.IOCore.updateCore(((this.IOCore.gfx.OAMLockedCycles() | 0) + 1) | 0);
	this.nonSequential = false;
}