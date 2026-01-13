export type MCVersion = {
    id: string;
    type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
    url: string;
    time: string;
    releaseTime: string;
};

export type MCVersionType = 'release' | 'snapshot' | 'old_beta' | 'old_alpha';