import { networkInterfaces } from 'os';

export function detectLanIp(): string | null {
    const nets = networkInterfaces();

    for (const name of Object.keys(nets)) {
        const ifaces = nets[name];
        if (!ifaces) continue;

        for (const iface of ifaces) {
            if (iface.family !== 'IPv4' || iface.internal) continue;
            // Skip VirtualBox, VMware, Docker adapters
            if (/virtual|vmware|docker|vethernet|loopback/i.test(name)) continue;
            return iface.address;
        }
    }

    return null;
}
